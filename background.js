chrome.runtime.onInstalled.addListener(() => {
  google.accounts.id.initialize({
    client_id: 'YOUR_CLIENT_ID',
    callback: handleCredentialResponse
  });
});

function handleCredentialResponse(response) {
  if (response.credential) {
    const token = response.credential;
    console.log('Auth token retrieved:', token);
  } else {
    console.error('Error getting auth token');
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'createCalendarAndAddCourses') {
    google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        console.error('Auth prompt not displayed or skipped');
        sendResponse({ error: 'Auth prompt not displayed or skipped' });
        return;
      }

      handleCredentialResponse(notification);
    });

    return true; // Required to indicate async response
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