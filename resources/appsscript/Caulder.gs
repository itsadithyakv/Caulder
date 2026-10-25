/**
 * Caulder — the Google bridge: Calendar, Tasks, Gmail, Contacts, backups in
 * Drive, and your contacts as a Google Sheet.
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
 * 2.  In the left sidebar, click the + beside **Services** and add:
 *         Google Calendar API
 *         Tasks API
 *         People API        (optional: only for saving contacts to your phone)
 *     Leave the identifiers as the defaults: "Calendar", "Tasks", "People".
 *
 *     The People API is what puts a contact added in Caulder into Google
 *     Contacts, which is what your phone's address book syncs with. Leave it
 *     out and everything else works; Caulder says so where it matters.
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
 * YOUR CONTACTS AS A GOOGLE SHEET
 * ---------------------------------------------------------------------------
 *
 * In Caulder, Settings > Google > Contacts in a Google Sheet. Caulder asks
 * this script to keep a spreadsheet in your Drive, one per company, called
 * "Caulder contacts - <company>": a row a contact, so they can be read and
 * edited on a phone. Caulder reads the sheet, takes in what you changed
 * there, and writes it back. The sheet is yours: stop the sync in Caulder and
 * it stays where it is.
 * ========================================================================= */

/** Caulder reads this to know what the script can do. Email arrived in 2, contacts and Drive backups in 4, the contacts sheet in 6, files with a message in 8. */
var SCRIPT_VERSION = 8;

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
  // Tasks only if the Tasks API is under Services; said plainly when it is not.
  if (typeof Tasks === "undefined") {
    Logger.log("The Tasks API is not under Services, so your tasks will not sync. Add it (step 2), then run setUp again.");
  } else {
    Tasks.Tasklists.list({ maxResults: 100 });
  }
  GmailApp.getAliases();
  MailApp.getRemainingDailyQuota();
  // Backups go in a folder in your own Drive. Contacts only if you added the
  // People API under Services: it is optional, and its absence is not an error.
  if (typeof DriveApp !== "undefined") DriveApp.getRootFolder().getName();
  // Your contacts as a spreadsheet, when Caulder is asked to keep one.
  if (typeof SpreadsheetApp !== "undefined") SpreadsheetApp.getActiveSpreadsheet();
  if (typeof People !== "undefined") People.People.get("people/me", { personFields: "names" });

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
    case "sheetRead":
      return sheetRead(request);
    case "sheetWrite":
      return sheetWrite(request);
    case "saveContact":
      return saveContact(request);
    case "pullContacts":
      return pullContacts(request);
    case "backupPut":
      return backupPut(request);
    case "backupList":
      return backupList();
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

  // Without the Tasks API under Services there are no lists to offer - and
  // that is said, rather than the whole connection failing over it.
  var lists = [];
  var tasksReady = typeof Tasks !== "undefined";
  if (tasksReady) {
    var listToken = null;
    do {
      var listOptions = { maxResults: 100 };
      if (listToken) listOptions.pageToken = listToken;
      var page = Tasks.Tasklists.list(listOptions);
      var items = page.items || [];
      for (var j = 0; j < items.length; j += 1) {
        lists.push({ id: items[j].id, name: items[j].title });
      }
      listToken = page.nextPageToken || null;
    } while (listToken);
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
    tasks: tasksReady,
    version: SCRIPT_VERSION,
    mail: mail,
    mailError: mailError,
    // Contacts need a service that has to be added by hand, so Caulder is told
    // whether it was rather than finding out from a failure.
    contacts: typeof People !== "undefined",
    drive: typeof DriveApp !== "undefined",
  };
}

/* ---- Contacts ----------------------------------------------------------- */

/**
 * One contact into Google Contacts - which is what a phone's address book
 * syncs with, so a contact added in Caulder is one that rings with a name.
 *
 * Caulder writes the contact and remembers which one it wrote
 * (`resourceName`), so saving again updates it rather than making a second.
 *
 * Reading the other way is `pullContacts` below, and it happens only when
 * somebody presses the button for it - there is no background read of your
 * address book, and nothing about the people in it leaves Google on its own.
 *
 * A contact deleted on the phone and saved again from Caulder is made again,
 * because a contact you are still working with is one you still want to reach.
 */
function saveContact(request) {
  if (typeof People === "undefined") {
    throw new Error(
      "Your Google script cannot save contacts yet. Open it, press + beside Services, add the People API, then run setUp once more.",
    );
  }
  var contact = request.contact || {};
  var company = String(contact.name || "").trim();
  var person = String(contact.person || "").trim();
  if (!company && !person) throw new Error("A contact needs a name.");

  // A person is filed under their own name, at the company; a company with
  // nobody named on it is filed under the company's.
  var words = (person || company).split(/\s+/);
  var body = {
    names: [{ givenName: words[0], familyName: words.slice(1).join(" ") }],
    organizations: person && company ? [{ name: company, title: String(contact.role || "") }] : [],
    phoneNumbers: contact.phone ? [{ value: String(contact.phone), type: "work" }] : [],
    emailAddresses: contact.email ? [{ value: String(contact.email), type: "work" }] : [],
  };
  var fields = "names,organizations,phoneNumbers,emailAddresses";

  if (request.resourceName) {
    try {
      var current = People.People.get(request.resourceName, { personFields: fields });
      body.etag = current.etag;
      var updated = People.People.updateContact(body, request.resourceName, { updatePersonFields: fields });
      return { resourceName: updated.resourceName, made: false };
    } catch (gone) {
      // Deleted in Google since: made again below.
    }
  }
  var made = People.People.createContact(body);
  return { resourceName: made.resourceName, made: true };
}

/**
 * Your address book, once, because you asked for it.
 *
 * The other half of `saveContact`, and deliberately not a sync: Caulder pulls
 * the list when somebody presses Import, shows it to them, and lets them
 * choose what to keep. Nothing here runs on a timer.
 *
 * Followed to the end, for the reason `pullTasks` has an essay about: a page
 * is not a list, and an address book is the one place a person is certain to
 * have more than a hundred of something. It says plainly whether it finished,
 * and Caulder tells them when it did not rather than quietly importing a
 * prefix.
 *
 * Only the fields Caulder has a column for are asked for. Birthdays, photos,
 * relations and the rest stay in Google.
 */
function pullContacts(request) {
  if (typeof People === "undefined") {
    throw new Error(
      "Your Google script cannot read contacts yet. Open it, press + beside Services, add the People API, then run setUp once more.",
    );
  }

  var fields = "names,organizations,emailAddresses,phoneNumbers,addresses,urls,biographies";
  var out = [];
  var token = null;
  var pages = 0;
  var complete = true;

  do {
    var options = { personFields: fields, pageSize: 200 };
    if (token) options.pageToken = token;

    var response = People.People.Connections.list("people/me", options);
    var people = response.connections || [];
    for (var i = 0; i < people.length; i += 1) out.push(people[i]);

    token = response.nextPageToken || null;
    pages += 1;

    // The same guard the tasks have. Stopping is fine; claiming to have
    // finished would not be.
    if (pages >= 25 && token) {
      complete = false;
      break;
    }
  } while (token);

  return { contacts: out, complete: complete };
}

/* ---- Backups, in Drive -------------------------------------------------- */

var BACKUP_FOLDER = "Caulder backups";
/** The newest few. Older ones go to Drive's bin, where Google keeps them thirty days more. */
var BACKUPS_KEPT = 10;

function backupFolder() {
  var found = DriveApp.getFoldersByName(BACKUP_FOLDER);
  return found.hasNext() ? found.next() : DriveApp.createFolder(BACKUP_FOLDER);
}

function backupsIn(folder) {
  var all = [];
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    all.push({ file: file, at: file.getDateCreated().getTime() });
  }
  all.sort(function (a, b) {
    return b.at - a.at;
  });
  return all;
}

/**
 * One backup file into the folder. Sent whole, as base64, because a web app
 * takes one request body; Caulder refuses to send one too large for that
 * before it gets here.
 */
function backupPut(request) {
  var name = String(request.name || "");
  if (!/^[\w.-]{1,120}$/.test(name)) throw new Error("That is not a backup file's name.");
  var blob = Utilities.newBlob(Utilities.base64Decode(String(request.data || "")), "application/octet-stream", name);
  var folder = backupFolder();
  var file = folder.createFile(blob);

  var all = backupsIn(folder);
  for (var i = BACKUPS_KEPT; i < all.length; i += 1) all[i].file.setTrashed(true);

  return { name: file.getName(), size: file.getSize(), at: isoOf(file.getDateCreated().getTime()), kept: Math.min(all.length, BACKUPS_KEPT) };
}

function backupList() {
  var all = backupsIn(backupFolder()).slice(0, BACKUPS_KEPT);
  var out = [];
  for (var i = 0; i < all.length; i += 1) {
    out.push({ name: all[i].file.getName(), size: all[i].file.getSize(), at: isoOf(all[i].at) });
  }
  return { folder: BACKUP_FOLDER, backups: out };
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
/** Said when the Tasks API was never added: the one way task sync fails that the person can mend. */
function needTasks() {
  if (typeof Tasks === "undefined") {
    throw new Error("Your Google script has no Tasks API. Open it, add Tasks API under Services, and run setUp again.");
  }
}

function pullTasks(request) {
  needTasks();
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
  needTasks();
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
function deliver(to, subject, body, attachments) {
  var options = attachments && attachments.length ? { attachments: attachments } : {};
  var message = GmailApp.createDraft(to, subject, body, options).send();
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

  // A file goes with a message sent now: what waits is kept where a file does not fit.
  var files = [];
  var given = request.attachments || [];
  for (var i = 0; i < given.length; i++) {
    var file = given[i] || {};
    if (!file.name || !file.data) throw new Error("A file came without its name or its contents.");
    files.push(Utilities.newBlob(Utilities.base64Decode(String(file.data)), String(file.mimeType || "application/pdf"), String(file.name)));
  }
  if (files.length && sendAt && sendAt > Date.now() + 60000) throw new Error("A message with a file is sent at once, not held.");

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
      markSent(job, deliver(to, subject, body, files));
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

/* ---- Contacts in a Google Sheet ------------------------------------------ */

/**
 * Your contacts as a spreadsheet in your own Drive, one per company, so they
 * can be read and edited on a phone.
 *
 * Caulder does the thinking. It reads every row (`sheetRead`), works out what
 * you changed here since it last wrote, takes that in, and writes the whole
 * list back (`sheetWrite`). This script only fetches and stores: it never
 * decides which side is right, so there is one place that rule lives.
 *
 * Which spreadsheet is a company's is remembered in this script's own
 * properties, by the company's id. One moved to the bin is forgotten, and a
 * new one is made the next time Caulder asks.
 */
var SHEET_PREFIX = "CAULDER_CONTACTS_SHEET_";
var SHEET_TAB = "Contacts";
/** More rows than this in one sheet is not somebody's contact list. */
var SHEET_MAX_ROWS = 5000;

function contactsBook(request) {
  var company = String(request.company || "");
  if (!/^[A-Za-z0-9-]{1,64}$/.test(company)) throw new Error("Caulder did not say which company's contacts these are.");
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(SHEET_PREFIX + company);
  var book = null;
  if (id) {
    try {
      book = SpreadsheetApp.openById(id);
      if (typeof DriveApp !== "undefined" && DriveApp.getFileById(id).isTrashed()) book = null;
    } catch (error) {
      book = null;
    }
  }
  if (!book) {
    book = SpreadsheetApp.create("Caulder contacts - " + String(request.name || "My company").slice(0, 80));
    props.setProperty(SHEET_PREFIX + company, book.getId());
  }
  return book;
}

function contactsTab(book) {
  var sheet = book.getSheetByName(SHEET_TAB);
  if (!sheet) {
    sheet = book.getSheets()[0];
    sheet.setName(SHEET_TAB);
  }
  return sheet;
}

/** Every row under the heading, as the text each cell shows. Makes the spreadsheet the first time. */
function sheetRead(request) {
  var book = contactsBook(request);
  var sheet = contactsTab(book);
  var width = Math.max(1, Math.min(40, Number(request.columns) || 1));
  var last = sheet.getLastRow();
  if (last - 1 > SHEET_MAX_ROWS) throw new Error("That sheet has more than " + SHEET_MAX_ROWS + " rows, which is more than Caulder reads.");
  var rows = last > 1 ? sheet.getRange(2, 1, last - 1, width).getDisplayValues() : [];
  return { id: book.getId(), url: book.getUrl(), rows: rows };
}

/** The whole list, written over what was there. Every cell is text: a phone number is not a sum. */
function sheetWrite(request) {
  var header = request.header || [];
  var rows = request.rows || [];
  if (!header.length) throw new Error("Caulder sent no headings for the sheet.");
  if (rows.length > SHEET_MAX_ROWS) throw new Error("That is more than " + SHEET_MAX_ROWS + " contacts, which is more than one sheet is given.");
  var book = contactsBook(request);
  var sheet = contactsTab(book);
  var width = header.length;
  var all = [header];
  for (var i = 0; i < rows.length; i += 1) {
    var row = [];
    for (var j = 0; j < width; j += 1) row.push(rows[i][j] === null || rows[i][j] === undefined ? "" : String(rows[i][j]));
    all.push(row);
  }
  sheet.clearContents();
  sheet.getRange(1, 1, all.length, width).setNumberFormat("@").setValues(all);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, width).setFontWeight("bold");
  // The first column is Caulder's own id for the row. Out of sight, so it is not typed over.
  sheet.hideColumns(1);
  return { id: book.getId(), url: book.getUrl(), count: rows.length };
}
