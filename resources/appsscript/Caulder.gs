/**
 * Caulder — the Google bridge: Calendar, Tasks, Gmail and the shared brain.
 *
 * Paste this whole file into a Google Apps Script project and follow the
 * steps below. It runs inside your own Google account and Caulder talks to it
 * over HTTPS; Caulder itself never signs in to Google.
 */

/* ===========================================================================
 * Why a script
 * ===========================================================================
 *
 * Google Calendar, Tasks and Gmail are "sensitive" or "restricted" scopes, so
 * a desktop app signing in directly would need Google's review, or would make
 * you sign in again every seven days forever. This script already runs AS
 * YOU, inside your own account, so it can simply do the work and hand back
 * the answer. Nothing about your Google account leaves it, and Caulder never
 * sees a Google password.
 *
 * ---------------------------------------------------------------------------
 * SETTING IT UP — about five minutes, once
 * ---------------------------------------------------------------------------
 *
 * 1.  Paste this whole file over everything in a new Apps Script project
 *     (script.new opens one). Click "Untitled project" at the top, name it
 *     Caulder, and save.
 *
 * 2.  In the left sidebar, click the + beside **Services** and add BOTH:
 *         Google Calendar API
 *         Tasks API
 *     Leave the identifiers as the defaults, "Calendar" and "Tasks".
 *
 * 3.  Choose `setUp` in the function dropdown at the top and press **Run**,
 *     then **Review permissions** and your account. This is your own script
 *     and nobody at Google has reviewed it, so Google says "Google hasn't
 *     verified this app": press **Advanced**, then **Go to Caulder (unsafe)**,
 *     then **Allow**. It is asking for your own calendar, tasks and Gmail.
 *
 *     The Execution log underneath then prints a line like:
 *         Your Caulder key: 7f3a...
 *     Copy that line. It is generated here, once.
 *
 * 4.  Click **Deploy > New deployment**, click the gear, choose **Web app**,
 *     then set:
 *         Execute as:      Me
 *         Who has access:  Anyone
 *     Press Deploy and copy the **Web app URL** (it ends in `/exec`).
 *
 *     "Anyone" sounds alarming and is not: the URL is unguessable, and
 *     nothing happens without the key from step 3. It has to be set this way
 *     because Caulder is not signed in to Google, which is the entire point.
 *
 * 5.  In Caulder, open Settings > Google, paste the URL and the key, and press
 *     Connect.
 *
 * ---------------------------------------------------------------------------
 * UPDATING IT
 * ---------------------------------------------------------------------------
 *
 * Paste the new file over the old one and save. Then press **Deploy > Manage
 * deployments**, the pencil, **Version > New version**, and **Deploy** — a
 * brand new deployment would give you a different URL to paste in again.
 * Finally run `setUp` once more, so Google can ask for anything the new
 * version needs and the email trigger is in place.
 *
 * To cut Caulder off at any time, run `revoke` below or delete the
 * deployment. Either takes effect immediately.
 *
 * ---------------------------------------------------------------------------
 * SHARING THE BRAIN WITH A CO-FOUNDER
 * ---------------------------------------------------------------------------
 *
 * In Caulder, Brain > Two founders > Share. Caulder asks this script to keep
 * the brain in a spreadsheet in your Drive called "Caulder brain", and hands
 * you an invitation to send your co-founder. The invitation reaches that
 * brain and nothing else: not your calendar, not your email. Stop sharing
 * cancels it.
 * ========================================================================= */

/** Caulder reads this to know what the script can do. Email arrived in 2, the shared brain in 3. */
var SCRIPT_VERSION = 3;

/** Run once, by hand. Grants permission and prints the key. */
function setUp() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty("CAULDER_SECRET");

  if (!key) {
    key = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    props.setProperty("CAULDER_SECRET", key);
  }

  // Touching each service here is what makes Google ask for permission now,
  // during a run you are watching, rather than on the first request from
  // Caulder - where the failure would arrive as an unexplained error.
  CalendarApp.getDefaultCalendar().getName();
  Tasks.Tasklists.list();
  GmailApp.getAliases();
  MailApp.getRemainingDailyQuota();

  // What sends a scheduled email, and notices a reply, with Caulder closed.
  installTrigger();

  Logger.log("Your Caulder key: " + key);
  Logger.log("Now deploy this as a web app and paste both into Caulder.");
}

/** Run by hand to cut Caulder off. The old key stops working immediately. */
function revoke() {
  PropertiesService.getScriptProperties().deleteProperty("CAULDER_SECRET");
  removeTrigger();
  Logger.log("Done. Scheduled emails stay unsent. Run setUp again to issue a new key.");
}

/**
 * The single entry point.
 *
 * POST rather than GET on purpose: a GET puts its parameters in the URL, and
 * URLs end up in server logs and browser history. A key belongs in a body.
 */
function doPost(e) {
  var request;
  try {
    request = JSON.parse(e.postData.contents);
  } catch (error) {
    return reply({ ok: false, error: "That was not readable JSON." });
  }

  // An invitation to a shared brain: that brain's log, and nothing else.
  if (request.invite) {
    var invited = PropertiesService.getScriptProperties().getProperty(INVITE_PREFIX + String(request.invite));
    if (!invited) {
      return reply({ ok: false, error: "That invitation is not right, or the brain is no longer shared." });
    }
    if (INVITED_ACTIONS.indexOf(request.action) === -1) {
      return reply({ ok: false, error: "An invitation only reaches the shared brain." });
    }
    request.key = invited;
    try {
      return reply({ ok: true, data: handle(request) });
    } catch (error) {
      return reply({ ok: false, error: String((error && error.message) || error) });
    }
  }

  var expected = PropertiesService.getScriptProperties().getProperty("CAULDER_SECRET");
  if (!expected) {
    return reply({ ok: false, error: "This script has no key yet. Run setUp in the editor." });
  }
  if (!request.secret || request.secret !== expected) {
    return reply({ ok: false, error: "That key is not right." });
  }

  try {
    return reply({ ok: true, data: handle(request) });
  } catch (error) {
    return reply({ ok: false, error: String((error && error.message) || error) });
  }
}

function handle(request) {
  switch (request.action) {
    case "hello":
      return hello();
    case "pullEvents":
      return pullEvents(request);
    case "pushEvents":
      return pushEvents(request);
    case "pullTasks":
      return pullTasks(request);
    case "pushTasks":
      return pushTasks(request);
    case "sendEmail":
      return sendEmail(request);
    case "emailStatus":
      return emailStatus(request);
    case "cancelEmail":
      return cancelEmail(request);
    case "brainCreate":
      return brainCreate(request);
    case "brainInvite":
      return brainInvite(request);
    case "brainClose":
      return brainClose(request);
    case "brainInfo":
      return brainInfo(request);
    case "brainPush":
      return brainPush(request);
    case "brainPull":
      return brainPull(request);
    default:
      throw new Error("Caulder asked for something this script does not do: " + request.action);
  }
}

function reply(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/** What Caulder can choose between. Also the connection test. */
function hello() {
  var calendars = [];
  var all = CalendarApp.getAllOwnedCalendars();
  for (var i = 0; i < all.length; i += 1) {
    calendars.push({ id: all[i].getId(), name: all[i].getName() });
  }

  var lists = [];
  var items = Tasks.Tasklists.list().items || [];
  for (var j = 0; j < items.length; j += 1) {
    lists.push({ id: items[j].id, name: items[j].title });
  }

  // Asked separately, so a script updated but not yet re-authorised still
  // answers about the calendar and says what is missing for email.
  var mail = null;
  var mailError = null;
  try {
    mail = { address: myAddresses()[0], remaining: MailApp.getRemainingDailyQuota() };
  } catch (error) {
    mailError =
      "Your Google script cannot send email yet. Open it and run setUp once more so Google can ask for permission.";
  }
  if (!mailError && !hasTrigger()) {
    mailError =
      "Your Google script has no timer for scheduled email and follow-ups. Open it and run setUp once more.";
  }

  return {
    email: Session.getActiveUser().getEmail(),
    calendars: calendars,
    taskLists: lists,
    version: SCRIPT_VERSION,
    mail: mail,
    mailError: mailError,
  };
}

/* ---- The calendar ------------------------------------------------------- */

/**
 * Events between two days, in Caulder's own shape.
 *
 * All-day events are skipped. A Caulder block occupies hours; an all-day event
 * has no hours to occupy, and turning one into a midnight-to-midnight block
 * would fill the grid with something nobody put there.
 */
function pullEvents(request) {
  var zone = request.timeZone || Session.getScriptTimeZone();

  var response = Calendar.Events.list(request.calendarId, {
    timeMin: request.from + "T00:00:00Z",
    timeMax: request.to + "T23:59:59Z",
    singleEvents: true,
    maxResults: 2500,
    showDeleted: false,
  });

  var out = [];
  var items = response.items || [];

  for (var i = 0; i < items.length; i += 1) {
    var item = items[i];
    if (!item.start || !item.start.dateTime) continue;

    var start = new Date(item.start.dateTime);
    var end = new Date(item.end.dateTime);
    var minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    if (minutes <= 0) continue;

    var caulderId = null;
    if (item.extendedProperties && item.extendedProperties["private"]) {
      caulderId = item.extendedProperties["private"].caulderId || null;
    }

    out.push({
      id: item.id,
      etag: item.etag || null,
      caulderId: caulderId,
      title: item.summary || "(no title)",
      day: Utilities.formatDate(start, zone, "yyyy-MM-dd"),
      startsAt: Utilities.formatDate(start, zone, "HH:mm"),
      minutes: minutes,
    });
  }

  return { events: out };
}

/** Builds the Calendar resource for one block. */
function eventFrom(block, zone) {
  var endMinutes = minutesOf(block.startsAt) + block.minutes;
  // Clamped: Calendar will happily accept an end past midnight and then draw
  // the block across two days.
  if (endMinutes > 24 * 60 - 1) endMinutes = 24 * 60 - 1;

  var resource = {
    summary: block.title,
    description: block.notes || "",
    start: { dateTime: block.day + "T" + block.startsAt + ":00", timeZone: zone },
    end: { dateTime: block.day + "T" + timeOf(endMinutes) + ":00", timeZone: zone },
    extendedProperties: { "private": { caulderId: block.id } },
  };

  return resource;
}

function minutesOf(time) {
  var parts = String(time).split(":");
  return Number(parts[0]) * 60 + Number(parts[1]);
}

function timeOf(minutes) {
  var hour = Math.floor(minutes / 60);
  var minute = minutes % 60;
  return (hour < 10 ? "0" : "") + hour + ":" + (minute < 10 ? "0" : "") + minute;
}

/**
 * Applies one plan: creates, updates and deletions in a single round trip.
 *
 * Every arm is wrapped on its own. One event whose id has gone stale must not
 * stop the other forty being written - a half-applied sync that reports
 * failure is worse than one that reports exactly what it managed.
 */
function pushEvents(request) {
  var zone = request.timeZone || Session.getScriptTimeZone();
  var created = [];
  var updated = [];
  var failures = [];

  var toCreate = request.create || [];
  for (var i = 0; i < toCreate.length; i += 1) {
    try {
      var made = Calendar.Events.insert(eventFrom(toCreate[i], zone), request.calendarId);
      created.push({ blockId: toCreate[i].id, eventId: made.id, etag: made.etag || null });
    } catch (error) {
      failures.push({ blockId: toCreate[i].id, error: String(error) });
    }
  }

  var toUpdate = request.update || [];
  for (var j = 0; j < toUpdate.length; j += 1) {
    try {
      var patched = Calendar.Events.patch(
        eventFrom(toUpdate[j], zone),
        request.calendarId,
        toUpdate[j].externalId,
      );
      updated.push({ blockId: toUpdate[j].id, eventId: patched.id, etag: patched.etag || null });
    } catch (error) {
      // Usually the event was deleted in Calendar while Caulder still held its
      // id. For a block Caulder owns, making it again is the right answer.
      try {
        var again = Calendar.Events.insert(eventFrom(toUpdate[j], zone), request.calendarId);
        created.push({ blockId: toUpdate[j].id, eventId: again.id, etag: again.etag || null });
      } catch (second) {
        failures.push({ blockId: toUpdate[j].id, error: String(second) });
      }
    }
  }

  var toRemove = request.remove || [];
  for (var k = 0; k < toRemove.length; k += 1) {
    try {
      Calendar.Events.remove(request.calendarId, toRemove[k]);
    } catch (error) {
      // Already gone is the outcome we wanted, not a failure.
    }
  }

  return { created: created, updated: updated, failures: failures };
}

/* ---- Tasks -------------------------------------------------------------- */

/**
 * The whole list, followed to the end.
 *
 * Google hands back a page at a time. Reading only the first one and telling
 * Caulder it was everything is how the hundred and first task gets deleted,
 * so this follows nextPageToken and says plainly whether it finished.
 */
function pullTasks(request) {
  var out = [];
  var token = null;
  var pages = 0;
  var complete = true;

  do {
    var options = { showCompleted: true, showHidden: true, maxResults: 100 };
    if (token) options.pageToken = token;

    var response = Tasks.Tasks.list(request.taskListId, options);
    collectTasks(response.items || [], out);

    token = response.nextPageToken || null;
    pages += 1;

    // A guard against a list so long it would run the script out of time.
    // Stopping is fine; claiming to have finished would not be.
    if (pages >= 20 && token) {
      complete = false;
      break;
    }
  } while (token);

  return { tasks: out, complete: complete };
}

function collectTasks(items, out) {
  for (var i = 0; i < items.length; i += 1) {
    var item = items[i];
    out.push({
      id: item.id,
      title: item.title || "(no title)",
      // Google stores a date with a midnight UTC time attached. Only the date
      // half means anything - reading the time would move the task a day for
      // anybody east of London.
      due: item.due ? String(item.due).slice(0, 10) : null,
      notes: item.notes || null,
      done: item.status === "completed",
    });
  }
}

function taskFrom(task) {
  return {
    title: task.title,
    notes: task.notes || "",
    due: task.dueOn + "T00:00:00.000Z",
    status: task.done ? "completed" : "needsAction",
  };
}

function pushTasks(request) {
  var created = [];
  var failures = [];

  var toCreate = request.create || [];
  for (var i = 0; i < toCreate.length; i += 1) {
    try {
      var made = Tasks.Tasks.insert(taskFrom(toCreate[i]), request.taskListId);
      created.push({ taskId: toCreate[i].id, externalId: made.id });
    } catch (error) {
      failures.push({ taskId: toCreate[i].id, error: String(error) });
    }
  }

  var toUpdate = request.update || [];
  for (var j = 0; j < toUpdate.length; j += 1) {
    try {
      Tasks.Tasks.patch(taskFrom(toUpdate[j]), request.taskListId, toUpdate[j].externalId);
    } catch (error) {
      try {
        var again = Tasks.Tasks.insert(taskFrom(toUpdate[j]), request.taskListId);
        created.push({ taskId: toUpdate[j].id, externalId: again.id });
      } catch (second) {
        failures.push({ taskId: toUpdate[j].id, error: String(second) });
      }
    }
  }

  var toRemove = request.remove || [];
  for (var k = 0; k < toRemove.length; k += 1) {
    try {
      Tasks.Tasks.remove(request.taskListId, toRemove[k]);
    } catch (error) {
      // Already gone.
    }
  }

  return { created: created, failures: failures };
}

/* ===========================================================================
 * Email
 * ===========================================================================
 *
 * Caulder hands over a message; this script sends it through your own Gmail,
 * now or at the time given, and keeps an eye on its thread. A reply from the
 * other side is noted, an out-of-office is not, and a bounce is a failure.
 * One follow-up can ride along: sent in the same thread after so many days if
 * nobody has answered, and dropped the moment somebody does.
 *
 * Waiting messages live in this script's own properties, one entry each, so
 * they go out on time with your laptop shut. Caulder is told what happened
 * and then asks the script to forget each one.
 * ========================================================================= */

var JOB_PREFIX = "caulder-mail:";
var DAY_MS = 24 * 60 * 60 * 1000;
/** How long after sending a thread is watched for a reply. Caulder uses the same. */
var WATCH_DAYS = 30;
/** Threads looked at per run, so a long list never meets the six-minute limit. */
var CHECKS_PER_RUN = 120;
/** A script property holds about 9 kB. */
var MAX_JOB_CHARS = 8500;

function installTrigger() {
  removeTrigger();
  ScriptApp.newTrigger("tick").timeBased().everyMinutes(15).create();
}

function removeTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i += 1) {
    if (triggers[i].getHandlerFunction() === "tick") ScriptApp.deleteTrigger(triggers[i]);
  }
}

function hasTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i += 1) {
    if (triggers[i].getHandlerFunction() === "tick") return true;
  }
  return false;
}

/** One at a time: the timer and a request from Caulder must not both edit a message. */
function withLock(work) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return work();
  } finally {
    lock.releaseLock();
  }
}

function readJob(id) {
  var raw = PropertiesService.getScriptProperties().getProperty(JOB_PREFIX + id);
  return raw ? JSON.parse(raw) : null;
}

function writeJob(job) {
  job.updatedAt = Date.now();
  var raw = JSON.stringify(job);
  if (raw.length > MAX_JOB_CHARS) {
    throw new Error(
      "That message is too long to hold until it goes. Send it now, or shorten it and its follow-up.",
    );
  }
  PropertiesService.getScriptProperties().setProperty(JOB_PREFIX + job.id, raw);
}

function forgetJob(id) {
  PropertiesService.getScriptProperties().deleteProperty(JOB_PREFIX + id);
}

function allJobs() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var jobs = [];
  for (var key in props) {
    if (key.indexOf(JOB_PREFIX) === 0) jobs.push(JSON.parse(props[key]));
  }
  return jobs;
}

function isoOf(ms) {
  return ms ? new Date(ms).toISOString() : null;
}

/** What Caulder is told about a message. Never the body. */
function viewOf(job) {
  return {
    id: job.id,
    status: job.status,
    sentAt: isoOf(job.sentAt),
    repliedAt: isoOf(job.repliedAt),
    error: job.error || null,
    followUp: job.followUp
      ? {
          status: job.followUp.status,
          sentAt: isoOf(job.followUp.sentAt),
          error: job.followUp.error || null,
        }
      : null,
  };
}

/** Every address this account sends as, lower-cased. The first is the account's own. */
function myAddresses() {
  var own = String(Session.getEffectiveUser().getEmail() || "").toLowerCase();
  var aliases = GmailApp.getAliases() || [];
  var all = [own];
  for (var i = 0; i < aliases.length; i += 1) all.push(String(aliases[i]).toLowerCase());
  return all;
}

function isMine(from, mine) {
  for (var i = 0; i < mine.length; i += 1) {
    if (mine[i] && from.indexOf(mine[i]) !== -1) return true;
  }
  return false;
}

/**
 * Sends a message and remembers its thread.
 *
 * Through a draft rather than GmailApp.sendEmail, because sending a draft
 * hands back the message, and its thread is how the reply is found later.
 */
function deliver(to, subject, body) {
  var message = GmailApp.createDraft(to, subject, body).send();
  return {
    threadId: message.getThread().getId(),
    messageId: message.getId(),
    sentAt: message.getDate().getTime(),
  };
}

function markSent(job, sent) {
  job.status = "sent";
  job.sentAt = sent.sentAt;
  job.threadId = sent.threadId;
  job.messageId = sent.messageId;
  job.body = "";
}

function sendEmail(request) {
  var id = String(request.id || "");
  var to = String(request.to || "").trim();
  var subject = String(request.subject || "").trim();
  var body = String(request.body || "");
  if (!id) throw new Error("Caulder did not say which message this is.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    throw new Error("That is not an address Gmail can send to: " + to);
  }
  if (!subject) throw new Error("A message needs a subject.");

  var sendAt = request.sendAt ? new Date(request.sendAt).getTime() : 0;
  if (request.sendAt && isNaN(sendAt)) throw new Error("That send time is not a date.");

  var followUp = null;
  if (request.followUp) {
    var days = Number(request.followUp.days);
    if (!(days >= 1 && days <= 60)) throw new Error("A follow-up waits between 1 and 60 days.");
    followUp = {
      days: days,
      body: String(request.followUp.body || ""),
      status: "waiting",
      sentAt: null,
      error: null,
    };
    if (!followUp.body.trim()) throw new Error("The follow-up has no text.");
  }

  return withLock(function () {
    // A retry of a message already handed over sends nothing twice.
    var existing = readJob(id);
    if (existing) return viewOf(existing);

    var job = {
      id: id,
      to: to,
      subject: subject,
      body: body,
      sendAt: sendAt,
      status: "scheduled",
      sentAt: null,
      repliedAt: null,
      threadId: null,
      messageId: null,
      error: null,
      checkedAt: 0,
      followUp: followUp,
    };

    // Due now: sent while Caulder waits, so a mistake comes back on screen.
    if (!sendAt || sendAt <= Date.now() + 60000) {
      markSent(job, deliver(to, subject, body));
    }

    writeJob(job);
    return viewOf(job);
  });
}

function emailStatus(request) {
  return withLock(function () {
    var ack = request.ack || [];
    for (var i = 0; i < ack.length; i += 1) forgetJob(String(ack[i]));

    var ids = request.ids || [];
    var emails = [];
    for (var j = 0; j < ids.length; j += 1) {
      var job = readJob(String(ids[j]));
      emails.push(
        job
          ? viewOf(job)
          : { id: String(ids[j]), status: "missing", sentAt: null, repliedAt: null, error: null, followUp: null },
      );
    }
    return { emails: emails, remaining: MailApp.getRemainingDailyQuota() };
  });
}

function cancelEmail(request) {
  var id = String(request.id || "");
  return withLock(function () {
    var job = readJob(id);
    if (!job) {
      return { id: id, status: "missing", sentAt: null, repliedAt: null, error: null, followUp: null };
    }
    if (job.status === "scheduled") {
      job.status = "cancelled";
      job.body = "";
    }
    stopFollowUp(job, "cancelled");
    writeJob(job);
    return viewOf(job);
  });
}

/** Run every fifteen minutes by the trigger setUp installs. */
function tick() {
  withLock(function () {
    var now = Date.now();
    var jobs = allJobs();

    // Due messages first: a late message is worse than a late reply check.
    for (var i = 0; i < jobs.length; i += 1) {
      var job = jobs[i];
      if (job.status !== "scheduled" || job.sendAt > now) continue;
      try {
        markSent(job, deliver(job.to, job.subject, job.body));
      } catch (error) {
        job.status = "failed";
        job.error = String((error && error.message) || error);
        job.body = "";
        stopFollowUp(job, "cancelled");
      }
      writeJob(job);
    }

    // Then the threads, least recently looked at first.
    var mine = myAddresses();
    var watching = jobs
      .filter(function (job) {
        return job.status === "sent" && job.threadId && now - job.sentAt < WATCH_DAYS * DAY_MS;
      })
      .sort(function (a, b) {
        return (a.checkedAt || 0) - (b.checkedAt || 0);
      })
      .slice(0, CHECKS_PER_RUN);

    for (var k = 0; k < watching.length; k += 1) {
      var watched = watching[k];
      try {
        checkThread(watched, mine, now);
      } catch (error) {
        watched.error = String((error && error.message) || error);
      }
      watched.checkedAt = now;
      writeJob(watched);
    }

    pruneJobs(now);
  });
}

/** One sent thread: a reply, a bounce, or time for the follow-up. */
function checkThread(job, mine, now) {
  var thread = GmailApp.getThreadById(job.threadId);
  if (!thread) throw new Error("The thread is no longer in Gmail.");

  var messages = thread.getMessages();
  for (var i = 0; i < messages.length; i += 1) {
    var message = messages[i];
    if (message.getDate().getTime() <= job.sentAt) continue;

    var from = String(message.getFrom() || "").toLowerCase();
    if (isBounce(from, message)) {
      job.status = "failed";
      job.error = "It bounced: " + message.getSubject();
      stopFollowUp(job, "cancelled");
      return;
    }
    // Ours - the follow-up - or a machine answering for a person.
    if (isMine(from, mine) || isAutoReply(message)) continue;

    job.status = "replied";
    job.repliedAt = message.getDate().getTime();
    stopFollowUp(job, "skipped");
    return;
  }

  var follow = job.followUp;
  if (follow && follow.status === "waiting" && now >= job.sentAt + follow.days * DAY_MS) {
    sendFollowUp(job);
  }
}

function stopFollowUp(job, why) {
  if (job.followUp && job.followUp.status === "waiting") {
    job.followUp.status = why;
    job.followUp.body = "";
  }
}

function isBounce(from, message) {
  return (
    from.indexOf("mailer-daemon") !== -1 ||
    from.indexOf("postmaster") !== -1 ||
    /^(delivery status notification|undeliverable|mail delivery failed)/i.test(message.getSubject())
  );
}

/** Out-of-office and other machines answering for people. */
function isAutoReply(message) {
  var submitted = String(message.getHeader("Auto-Submitted") || "").toLowerCase();
  if (submitted && submitted !== "no") return true;
  if (message.getHeader("X-Autoreply") || message.getHeader("X-Autorespond")) return true;
  return /^(automatic reply|auto(-|\s)?reply|out of (the )?office)/i.test(message.getSubject());
}

/**
 * The follow-up, in the same thread.
 *
 * Reply-all on your own message addresses the people it went to, the way
 * Gmail's own Reply all does. It is checked afterwards all the same: a
 * follow-up that did not reach the contact is reported, never assumed.
 */
function sendFollowUp(job) {
  var follow = job.followUp;
  try {
    GmailApp.getMessageById(job.messageId).replyAll(follow.body);
    var messages = GmailApp.getThreadById(job.threadId).getMessages();
    var last = messages[messages.length - 1];
    var to = String(last.getTo() || "").toLowerCase();
    if (to.indexOf(job.to.toLowerCase()) === -1) {
      throw new Error("The follow-up did not go to " + job.to + ". Check the thread in Gmail.");
    }
    follow.status = "sent";
    follow.sentAt = last.getDate().getTime();
  } catch (error) {
    follow.status = "failed";
    follow.error = String((error && error.message) || error);
  }
  follow.body = "";
}

/** Anything finished long ago is dropped even if Caulder never came back for it. */
function pruneJobs(now) {
  var jobs = allJobs();
  for (var i = 0; i < jobs.length; i += 1) {
    var job = jobs[i];
    var waiting =
      job.status === "scheduled" || (job.followUp && job.followUp.status === "waiting");
    var watched = job.status === "sent" && now - job.sentAt < WATCH_DAYS * DAY_MS;
    if (!waiting && !watched && now - (job.updatedAt || 0) > 60 * DAY_MS) forgetJob(job.id);
  }
}

/* ---- The shared brain ---------------------------------------------------- */

/*
 * Two founders, one brain, no server: the brain's pages live in a
 * spreadsheet in the owner's Drive, called "Caulder brain", made the first
 * time somebody shares.
 *
 * It is a log. Every change to a page is a row, never an edit of a row, and
 * each page's revisions are numbered here, so the two Caulders agree on what
 * revision 7 is. A change sent on top of an older revision than the latest
 * is still kept - as the next revision, marked as edited at the same time as
 * the one it did not see - so nothing is ever overwritten without a trace.
 *
 * The co-founder never gets the key at the top of this file, which also
 * reaches the calendar and the email. Sharing makes an INVITATION for that
 * one brain, and an invitation reaches nothing else. Stopping sharing on the
 * owner's side cancels it.
 */

var BRAIN_SHEET = "CAULDER_BRAIN_SHEET";
var INVITE_PREFIX = "CAULDER_BRAIN_INVITE_";
/** Characters per cell: a sheet cell holds 50,000, and a page is split over three. */
var CHUNK = 45000;
var PULL_ROWS = 300;
var PUSH_MOST = 100;
var REVISION_COLUMNS = 11;
/** What an invitation may ask for. */
var INVITED_ACTIONS = ["brainInfo", "brainPull", "brainPush"];

/** The spreadsheet, made on first use. Every column is plain text, so nothing in a page is read as a formula. */
function brainBook() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(BRAIN_SHEET);
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (error) {
      // Deleted from Drive. The brain is still on each founder's machine,
      // and the next push fills a new sheet.
    }
  }
  var book = SpreadsheetApp.create("Caulder brain");
  var brains = book.getSheets()[0];
  brains.setName("brains");
  brains.getRange("A:D").setNumberFormat("@");
  brains.appendRow(["key", "name", "created", "by"]);
  var pages = book.insertSheet("pages");
  pages.getRange("A:C").setNumberFormat("@");
  pages.appendRow(["key", "page", "revision"]);
  var revisions = book.insertSheet("revisions");
  revisions.getRange("A:K").setNumberFormat("@");
  revisions.appendRow([
    "key", "page", "revision", "author", "author id", "edited", "edited at the same time as", "deleted",
    "page", "page, continued", "page, continued",
  ]);
  props.setProperty(BRAIN_SHEET, book.getId());
  return book;
}

/** Every row under the header, as values. */
function rowsOf(sheet, columns) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, columns).getValues();
}

function brainRow(book, key) {
  var rows = rowsOf(book.getSheetByName("brains"), 4);
  for (var i = 0; i < rows.length; i += 1) {
    if (String(rows[i][0]) === String(key)) return rows[i];
  }
  throw new Error("That shared brain is not in this script any more.");
}

/** A brain shared for the first time: its key, and the invitation to send the co-founder. */
function brainCreate(request) {
  var name = String(request.name || "").slice(0, 120) || "Caulder brain";
  return withLock(function () {
    var book = brainBook();
    var key = Utilities.getUuid();
    book.getSheetByName("brains").appendRow([key, name, new Date().toISOString(), String(request.author || "")]);
    var invite = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    PropertiesService.getScriptProperties().setProperty(INVITE_PREFIX + invite, key);
    return { key: key, name: name, invite: invite };
  });
}

/** The invitation for a brain, made again if it was cancelled. For the owner. */
function brainInvite(request) {
  return withLock(function () {
    brainRow(brainBook(), request.key);
    var props = PropertiesService.getScriptProperties();
    var all = props.getProperties();
    for (var name in all) {
      if (name.indexOf(INVITE_PREFIX) === 0 && all[name] === request.key) {
        return { invite: name.slice(INVITE_PREFIX.length) };
      }
    }
    var invite = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    props.setProperty(INVITE_PREFIX + invite, request.key);
    return { invite: invite };
  });
}

/** Cancels a brain's invitation: the co-founder can no longer reach it. The log stays. */
function brainClose(request) {
  return withLock(function () {
    var props = PropertiesService.getScriptProperties();
    var all = props.getProperties();
    for (var name in all) {
      if (name.indexOf(INVITE_PREFIX) === 0 && all[name] === request.key) props.deleteProperty(name);
    }
    return { closed: true };
  });
}

/** What an invitation opens, so the co-founder can see it is the right one before joining. */
function brainInfo(request) {
  var row = brainRow(brainBook(), request.key);
  var pages = rowsOf(brainBook().getSheetByName("pages"), 3);
  var count = 0;
  for (var i = 0; i < pages.length; i += 1) {
    if (String(pages[i][0]) === String(request.key)) count += 1;
  }
  return { key: String(row[0]), name: String(row[1]), createdBy: String(row[3]), pages: count };
}

/**
 * Changes in: each one the next revision of its page. `baseRevision` is the
 * revision the change was made on top of; when that is not the latest, the
 * change is kept all the same and marked as made at the same time.
 */
function brainPush(request) {
  var changes = request.changes || [];
  if (changes.length > PUSH_MOST) throw new Error("Send at most " + PUSH_MOST + " pages at a time.");
  return withLock(function () {
    var book = brainBook();
    brainRow(book, request.key);
    var pages = book.getSheetByName("pages");
    var revisions = book.getSheetByName("revisions");

    var index = {};
    var known = rowsOf(pages, 3);
    for (var i = 0; i < known.length; i += 1) {
      if (String(known[i][0]) === String(request.key)) {
        index[String(known[i][1])] = { row: i + 2, revision: Number(known[i][2]), fresh: -1 };
      }
    }

    var added = [];
    var fresh = [];
    var results = [];
    for (var j = 0; j < changes.length; j += 1) {
      var change = changes[j];
      var pageId = String(change.pageId || "");
      if (!pageId) throw new Error("A page came without its id.");
      var payload = change.deleted ? "" : String(change.payload || "");
      if (payload.length > CHUNK * 3) throw new Error("A page is too long to share. Split it in two.");

      var entry = index[pageId];
      var latest = entry ? entry.revision : 0;
      var base = Number(change.baseRevision) || 0;
      var revision = latest + 1;
      var concurrent = latest > base ? String(latest) : "";

      added.push([
        String(request.key), pageId, String(revision), String(request.author || ""), String(request.authorId || ""),
        String(change.editedAt || new Date().toISOString()), concurrent, change.deleted ? "1" : "",
        payload.slice(0, CHUNK), payload.slice(CHUNK, CHUNK * 2), payload.slice(CHUNK * 2),
      ]);

      if (!entry) {
        fresh.push([String(request.key), pageId, String(revision)]);
        index[pageId] = { row: -1, revision: revision, fresh: fresh.length - 1 };
      } else if (entry.fresh >= 0) {
        fresh[entry.fresh][2] = String(revision);
        entry.revision = revision;
      } else {
        pages.getRange(entry.row, 3).setValue(String(revision));
        entry.revision = revision;
      }
      results.push({ pageId: pageId, revision: revision, concurrent: concurrent !== "" });
    }

    if (added.length > 0) {
      revisions.getRange(revisions.getLastRow() + 1, 1, added.length, REVISION_COLUMNS).setValues(added);
    }
    if (fresh.length > 0) pages.getRange(pages.getLastRow() + 1, 1, fresh.length, 3).setValues(fresh);
    return { results: results };
  });
}

/**
 * Changes out: every revision after `since`, a row in the log being one. The
 * cursor is a place in the log shared by every brain here, so another
 * brain's rows move it on without being sent.
 */
function brainPull(request) {
  var book = brainBook();
  brainRow(book, request.key);
  var revisions = book.getSheetByName("revisions");
  var total = Math.max(0, revisions.getLastRow() - 1);
  var since = Math.max(0, Math.min(total, Number(request.since) || 0));
  var until = Math.min(total, since + PULL_ROWS);
  var changes = [];
  if (until > since) {
    var rows = revisions.getRange(since + 2, 1, until - since, REVISION_COLUMNS).getValues();
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      if (String(row[0]) !== String(request.key)) continue;
      changes.push({
        pageId: String(row[1]),
        revision: Number(row[2]),
        author: String(row[3]),
        authorId: String(row[4]),
        editedAt: String(row[5]),
        concurrentWith: String(row[6]) === "" ? null : Number(row[6]),
        deleted: String(row[7]) === "1",
        payload: String(row[8]) + String(row[9]) + String(row[10]),
      });
    }
  }
  return { changes: changes, cursor: until, more: until < total };
}
