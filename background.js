chrome.runtime.onInstalled.addListener(() => {
  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    if (chrome.runtime.lastError || !token) {
      console.error('Error getting auth token:', chrome.runtime.lastError);
      return;
    }
    console.log('Auth token retrieved:', token);
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'createCalendarAndAddCourses') {
    chrome.identity.getAuthToken({ interactive: true }, async (token) => {
      if (chrome.runtime.lastError || !token) {
        console.error('Error getting auth token:', chrome.runtime.lastError);
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }

      try {
        const calendarId = await createCalendar(token);
        for (const course of request.courses) {
          await addCourseToCalendar(token, calendarId, course);
        }
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error creating event:', error.message);
        sendResponse({ error: error.message });
      }
    });

    // Required to indicate async response
    return true;
  }
});

async function createCalendar(token) {
  const createResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      summary: 'UBC Courses',
      timeZone: 'America/Vancouver'
    })
  });

  const data = await createResponse.json();
  if (createResponse.ok) {
    return data.id;
  } else {
    throw new Error(`Failed to create calendar: ${JSON.stringify(data)}`);
  }
}

async function addCourseToCalendar(token, calendarId, course) {
  const event = {
    summary: course.section,
    location: course.location,
    start: {
      dateTime: `${course.start_date}T${course.start_time}:00`,
      timeZone: 'America/Vancouver'
    },
    end: {
      dateTime: `${course.start_date}T${course.end_time}:00`,
      timeZone: 'America/Vancouver'
    },
    recurrence: [buildRecurrenceRule(course.days, course.end_date, course.alternate_weeks)]
  };

  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(event)
  });

  if (response.ok) {
    const event = await response.json();
    console.log('Event created:', event.htmlLink);
  } else {
    const errorResponse = await response.json();
    console.error('Error creating event:', JSON.stringify(errorResponse));
  }
}

function buildRecurrenceRule(days, endDate, alternateWeeks) {
  const rule = `RRULE:FREQ=WEEKLY;BYDAY=${days.join(',')};UNTIL=${endDate.replace(/-/g, '')}T235959Z`;
  if (alternateWeeks) {
    return rule + ';INTERVAL=2';
  }
  return rule;
}
//#11dff9;
//#ffff00;