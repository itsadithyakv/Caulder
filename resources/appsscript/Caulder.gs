/**
 * Caulder — the Google Calendar and Tasks bridge.
 *
 * Paste this whole file into a Google Apps Script project and follow the
 * steps below. It runs inside your own Google account and Caulder talks to it
 * over HTTPS; Caulder itself never signs in to Google.
 */

/* ===========================================================================
 * The calendar and task bridge
 * ===========================================================================
 *
 * Caulder calls this script directly over HTTPS.
 *
 * It works that way because the alternative does not. Google Calendar and
 * Tasks are "sensitive" scopes, so a desktop app signing in directly would
 * either need Google's review, or would make you sign in again every seven
 * days forever. This script already runs AS YOU, inside your own account, so
 * it can simply do the work and hand back the answer. Nothing about your
 * Google account leaves it, and Caulder never sees a Google password.
 *
 * ---------------------------------------------------------------------------
 * SETTING IT UP — about five minutes, once
 * ---------------------------------------------------------------------------
 *
 * 1.  In the Apps Script editor, click the + beside **Services** in the left
 *     sidebar and add BOTH of these:
 *         Google Calendar API
 *         Tasks API
 *     Leave the identifiers as the defaults, "Calendar" and "Tasks".
 *
 * 2.  Choose `setUp` in the function dropdown at the top and press **Run**.
 *     Google will ask you to allow it; that is the script asking for
 *     permission to your own calendar. Accept.
 *
 *     Look at the Execution log underneath. It prints a line like:
 *         Your Caulder key: 7f3a...
 *     Copy that. It is generated here and shown once.
 *
 * 3.  Click **Deploy > New deployment**. Choose type **Web app**, then set:
 *         Execute as:      Me
 *         Who has access:  Anyone
 *     Press Deploy and copy the **Web app URL** (it ends in `/exec`).
 *
 *     "Anyone" sounds alarming and is not: the URL is unguessable, and
 *     nothing happens without the key from step 2. It has to be set this way
 *     because Caulder is not signed in to Google, which is the entire point.
 *
 * 4.  In Caulder, open Settings > Google Calendar and Tasks, paste the URL and
 *     the key, and press Connect.
 *
 * If you ever change this file, press **Deploy > Manage deployments**, edit
 * the existing deployment and pick "New version" — a brand new deployment
 * would give you a different URL to paste in again.
 *
 * To cut Caulder off at any time, run `revoke` below or delete the
 * deployment. Either takes effect immediately.
 * ========================================================================= */

/** Run once, by hand. Grants permission and prints the key. */
function setUp() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty("CAULDER_SECRET");

  if (!key) {
    key = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    props.setProperty("CAULDER_SECRET", key);
  }

  // Touching both services here is what makes Google ask for permission now,
  // during a run you are watching, rather than on the first request from
  // Caulder - where the failure would arrive as an unexplained error.
  CalendarApp.getDefaultCalendar().getName();
  Tasks.Tasklists.list();

  Logger.log("Your Caulder key: " + key);
  Logger.log("Now deploy this as a web app and paste both into Caulder.");
}

/** Run by hand to cut Caulder off. The old key stops working immediately. */
function revoke() {
  PropertiesService.getScriptProperties().deleteProperty("CAULDER_SECRET");
  Logger.log("Done. Run setUp again to issue a new key.");
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

  return { email: Session.getActiveUser().getEmail(), calendars: calendars, taskLists: lists };
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
