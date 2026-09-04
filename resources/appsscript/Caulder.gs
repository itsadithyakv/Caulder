/**
 * Caulder — the sending half of the bridge.
 *
 * Caulder runs offline on a PC and cannot call Google; Apps Script runs in
 * Google's cloud and cannot call the PC. So the two talk through files:
 * Caulder writes an outbox, this script sends it and writes a log, and Caulder
 * reads the log back.
 *
 * ---------------------------------------------------------------------------
 * SETTING IT UP
 * ---------------------------------------------------------------------------
 *
 * 1.  Create a Google Sheet. Add three tabs, named exactly:
 *         Outbox      Log      Sent
 *
 * 2.  Open Extensions > Apps Script and paste this file in, replacing
 *     whatever is there.
 *
 * 3.  Set SENDER below to the address you send from. Leave it blank to use the
 *     Google account running the script. To send through Zoho instead, see
 *     sendOne() at the bottom.
 *
 * 4.  Run `processOutbox` once by hand and grant the permissions it asks for.
 *
 * 5.  Triggers > Add trigger > processOutbox, time-driven, every hour.
 *
 * Then, in Caulder: Export the outbox, paste its rows under the Outbox tab's
 * header, and after the script has run, download the Log tab as CSV and import
 * it back.
 *
 * ---------------------------------------------------------------------------
 * THE ONE RULE
 * ---------------------------------------------------------------------------
 *
 * `message_id` is the join key. Echo it back into the Log EXACTLY as it
 * arrived. Never edit it, never regenerate it, never let a spreadsheet reformat
 * it. Every status Caulder records is matched on it, and nothing is matched on
 * an address, a subject or a time, because all three are ambiguous and all
 * three can be edited by hand.
 */

/** The address to send from. Blank uses the account running this script. */
var SENDER = "";

/** A display name for the sender, or blank for the account default. */
var SENDER_NAME = "";

/** Stop after this many in one run. Gmail's own daily quota still applies. */
var MAX_PER_RUN = 50;

/**
 * Which service actually sends: "gmail", "zoho" or "smtp".
 *
 * Only this line changes to switch. Everything Caulder depends on - the two
 * CSV files and the message_id echoed back - is the same whichever you pick.
 *
 * Note that reply and bounce detection reads Gmail threads, so on "zoho" or
 * "smtp" the sent status still arrives but replies and bounces do not.
 */
var PROVIDER = "gmail";

var OUTBOX_SHEET = "Outbox";
var LOG_SHEET = "Log";
var SENT_SHEET = "Sent";

var LOG_HEADER = [
  "message_id",
  "status",
  "sent_at",
  "provider_message_id",
  "thread_id",
  "opened_at",
  "replied_at",
  "bounced_at",
  "error",
];

/**
 * The entry point. Put this on an hourly time-driven trigger.
 */
function processOutbox() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var outbox = book.getSheetByName(OUTBOX_SHEET);
  if (!outbox) throw new Error("No sheet named " + OUTBOX_SHEET);

  var log = ensureSheet(book, LOG_SHEET, LOG_HEADER);
  var sent = ensureSheet(book, SENT_SHEET, ["message_id", "processed_at"]);

  var rows = outbox.getDataRange().getValues();
  if (rows.length < 2) return;

  var header = rows[0].map(function (value) {
    return String(value).trim().toLowerCase();
  });

  var at = {};
  for (var c = 0; c < header.length; c += 1) at[header[c]] = c;

  if (at["message_id"] === undefined || at["to_email"] === undefined) {
    throw new Error("The Outbox needs message_id and to_email columns.");
  }

  // Which ids this script has already handled.
  //
  // This is what makes a re-exported outbox safe. Caulder will not normally
  // send you the same message twice, but a file pasted in twice by hand is an
  // ordinary mistake, and sending a lead the same email twice is not.
  var already = {};
  var sentRows = sent.getDataRange().getValues();
  for (var s = 1; s < sentRows.length; s += 1) {
    already[String(sentRows[s][0]).trim()] = true;
  }

  var results = [];
  var processed = [];
  var count = 0;

  for (var r = 1; r < rows.length && count < MAX_PER_RUN; r += 1) {
    var messageId = String(rows[r][at["message_id"]] || "").trim();
    if (!messageId) continue;
    if (already[messageId]) continue;

    var to = String(rows[r][at["to_email"]] || "").trim();
    var subject = String(rows[r][at["subject"]] || "").trim();
    var body = String(rows[r][at["body_html"]] || "");

    var now = new Date().toISOString();

    if (!to) {
      // Reported rather than dropped, so Caulder can show why nothing went.
      results.push([messageId, "skipped", "", "", "", "", "", "", "No address"]);
      processed.push([messageId, now]);
      already[messageId] = true;
      count += 1;
      continue;
    }

    try {
      var outcome = sendOne(to, subject, body);
      results.push([
        messageId,
        "sent",
        now,
        outcome.providerMessageId || "",
        outcome.threadId || "",
        "",
        "",
        "",
        "",
      ]);
    } catch (error) {
      // A failure is reported, never swallowed. Caulder retries it five times
      // with a growing wait; silence would mean it never went and nobody knew.
      results.push([
        messageId,
        "failed",
        "",
        "",
        "",
        "",
        "",
        "",
        String((error && error.message) || error),
      ]);
    }

    processed.push([messageId, now]);
    already[messageId] = true;
    count += 1;
  }

  if (results.length > 0) {
    log.getRange(log.getLastRow() + 1, 1, results.length, LOG_HEADER.length).setValues(results);
    sent.getRange(sent.getLastRow() + 1, 1, processed.length, 2).setValues(processed);
  }
}

/**
 * Records replies, so Caulder can stop chasing somebody who has answered.
 *
 * Put this on its own hourly trigger. It looks at the threads this script
 * started and appends a `replied` row for any that now has an answer.
 */
function checkReplies() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var log = ensureSheet(book, LOG_SHEET, LOG_HEADER);
  var rows = log.getDataRange().getValues();
  if (rows.length < 2) return;

  var threadOf = {};
  var settled = {};

  for (var r = 1; r < rows.length; r += 1) {
    var messageId = String(rows[r][0] || "").trim();
    var status = String(rows[r][1] || "").trim();
    var threadId = String(rows[r][4] || "").trim();
    // Both are terminal answers about this message, so neither needs looking
    // at again on the next run.
    if (status === "replied" || status === "bounced") settled[messageId] = true;
    if (status === "sent" && threadId) threadOf[messageId] = threadId;
  }

  var found = [];

  for (var id in threadOf) {
    if (settled[id]) continue;
    try {
      var thread = GmailApp.getThreadById(threadOf[id]);
      if (!thread) continue;

      var messages = thread.getMessages();
      var mine = Session.getActiveUser().getEmail();
      var answer = null;

      for (var m = 0; m < messages.length; m += 1) {
        var from = messages[m].getFrom();
        // Anything in the thread not from us is an answer of some kind.
        if (from.indexOf(mine) === -1) {
          answer = messages[m];
          break;
        }
      }

      if (!answer) continue;

      var when = answer.getDate().toISOString();

      // A bounce and a reply arrive the same way - a message in the thread
      // that is not from us. Telling them apart matters because they need
      // opposite answers: a reply means stop chasing and go and talk to them,
      // a bounce means the address is wrong and chasing it will never work.
      if (isBounce(answer.getFrom(), answer.getSubject())) {
        found.push([
          id,
          "bounced",
          "",
          "",
          threadOf[id],
          "",
          "",
          when,
          bounceReason(answer),
        ]);
      } else {
        found.push([id, "replied", "", "", threadOf[id], "", when, "", ""]);
      }
    } catch (error) {
      // A thread that has been deleted is not worth failing the whole run for.
    }
  }

  if (found.length > 0) {
    log.getRange(log.getLastRow() + 1, 1, found.length, LOG_HEADER.length).setValues(found);
  }
}

/**
 * Whether a message that came back is a delivery failure rather than a person.
 *
 * Checked on the sender first, because that is the part a mail system controls
 * and a human cannot accidentally imitate. The subject line is a second look
 * for systems that answer from a normal-looking address.
 */
function isBounce(from, subject) {
  var sender = String(from || "").toLowerCase();
  var line = String(subject || "").toLowerCase();

  if (
    sender.indexOf("mailer-daemon") !== -1 ||
    sender.indexOf("postmaster@") !== -1 ||
    sender.indexOf("no-reply@dns") !== -1
  ) {
    return true;
  }

  return (
    line.indexOf("delivery status notification") !== -1 ||
    line.indexOf("undelivered mail") !== -1 ||
    line.indexOf("delivery has failed") !== -1 ||
    line.indexOf("returned mail") !== -1 ||
    line.indexOf("address not found") !== -1
  );
}

/**
 * A short reason out of a bounce notice, for the queue to show.
 *
 * The whole notice is pages of headers nobody reads, so this takes the first
 * line that looks like an explanation and truncates it. Getting nothing back
 * is fine - the status alone already says what happened.
 */
function bounceReason(message) {
  var body = "";
  try {
    body = String(message.getPlainBody() || "");
  } catch (error) {
    return "";
  }

  var lines = body.split(/\r?\n/);
  for (var i = 0; i < lines.length; i += 1) {
    var line = lines[i].trim();
    if (line.length < 12) continue;
    if (
      /address not found|does not exist|couldn't be found|user unknown|mailbox (is )?full|blocked|rejected|550|5\.1\.1/i.test(
        line,
      )
    ) {
      return line.substring(0, 180);
    }
  }
  return "";
}

/**
 * Sends one message.
 *
 * This is the only part to change if you send through something other than
 * Gmail. For Zoho, replace the body of this function with a UrlFetchApp call
 * to the Zoho Mail API and return the ids it gives back — everything else in
 * this file, and everything in Caulder, stays the same.
 */
function sendOne(to, subject, body) {
  if (PROVIDER === "zoho") return sendViaZoho(to, subject, body);
  if (PROVIDER === "smtp") return sendViaSmtpRelay(to, subject, body);
  return sendViaGmail(to, subject, body);
}

/** Gmail, through the account this script runs as. */
function sendViaGmail(to, subject, body) {
  var options = { htmlBody: body };
  if (SENDER) options.from = SENDER;
  if (SENDER_NAME) options.name = SENDER_NAME;

  GmailApp.sendEmail(to, subject, stripHtml(body), options);

  // The most recently sent thread to this address is the one just created.
  var threads = GmailApp.search("to:" + to, 0, 1);
  if (threads.length === 0) return { providerMessageId: "", threadId: "" };

  var messages = threads[0].getMessages();
  var last = messages[messages.length - 1];

  return { providerMessageId: last.getId(), threadId: threads[0].getId() };
}

/**
 * Zoho Mail, through its REST API.
 *
 * Set PROVIDER to "zoho" above and fill in the three constants. The token is
 * an OAuth access token for the ZohoMail.messages.CREATE scope; Zoho's own
 * documentation covers getting one, and it belongs in Script Properties
 * rather than typed in here where it would be shared with the sheet.
 *
 * Everything else in this file is unchanged, because the contract Caulder
 * cares about is the two CSV files and the message_id - not the provider.
 */
function sendViaZoho(to, subject, body) {
  var token = PropertiesService.getScriptProperties().getProperty("ZOHO_TOKEN");
  var accountId = PropertiesService.getScriptProperties().getProperty("ZOHO_ACCOUNT_ID");

  if (!token || !accountId) {
    throw new Error(
      "Zoho is selected but ZOHO_TOKEN or ZOHO_ACCOUNT_ID is not set in Script Properties.",
    );
  }

  var response = UrlFetchApp.fetch(
    "https://mail.zoho.com/api/accounts/" + accountId + "/messages",
    {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Zoho-oauthtoken " + token },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        fromAddress: SENDER,
        toAddress: to,
        subject: subject,
        content: body,
        mailFormat: "html",
      }),
    },
  );

  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    // Thrown, not swallowed: processOutbox turns it into a `failed` row with
    // this text, which is how it reaches the queue in Caulder.
    throw new Error("Zoho returned " + code + ": " + response.getContentText().slice(0, 200));
  }

  var parsed = JSON.parse(response.getContentText());
  var data = parsed && parsed.data ? parsed.data : {};

  return {
    providerMessageId: String(data.messageId || ""),
    // Zoho has no thread id in this response. checkReplies only works against
    // Gmail threads, so on Zoho the reply and bounce statuses come from
    // whatever you set up on that side instead.
    threadId: "",
  };
}

/**
 * Anything else with an HTTP send API - Postmark, SendGrid, Brevo, Mailgun.
 *
 * The shape is always the same, so only the URL, the auth header and the two
 * field names change. Fill those in and set PROVIDER to "smtp".
 */
function sendViaSmtpRelay(to, subject, body) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty("RELAY_URL");
  var key = props.getProperty("RELAY_KEY");

  if (!url || !key) {
    throw new Error("PROVIDER is 'smtp' but RELAY_URL or RELAY_KEY is not set.");
  }

  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + key },
    muteHttpExceptions: true,
    payload: JSON.stringify({ from: SENDER, to: to, subject: subject, html: body }),
  });

  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error("Relay returned " + status + ": " + response.getContentText().slice(0, 200));
  }

  return { providerMessageId: "", threadId: "" };
}

/** A plain-text fallback, for clients that will not show HTML. */
function stripHtml(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function ensureSheet(book, name, header) {
  var sheet = book.getSheetByName(name);
  if (!sheet) {
    sheet = book.insertSheet(name);
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
    return sheet;
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
  }
  return sheet;
}
