const CLIENT_ID = '538677450042-97rspeteokce233agt5biim9s0kdqj9n.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/calendar.events';

let isSyncing = false;
let quoteInterval;

document.getElementById('syncButton').addEventListener('click', async () => {
    if (isSyncing) return;

    isSyncing = true;
    document.getElementById('status').innerText = 'Syncing...';

    const fileInput = document.getElementById('fileInput');

    if (fileInput.files.length === 0) {
        document.getElementById('status').innerText = 'Please select an Excel file.';
        isSyncing = false;
        return;
    }

    const quotes = await fetchQuotes();
    startQuoteDisplay(quotes);

    const file = fileInput.files[0];
    const courses = await parseExcel(file);

    gapi.load('client:auth2', () => {
        gapi.client.init({
            clientId: CLIENT_ID,
            scope: SCOPES
        }).then(() => {
            return gapi.auth2.getAuthInstance().signIn();
        }).then(() => {
            const calendarId = 'primary'; // or create a new calendar using gapi.client.calendar.calendars.insert
            return Promise.all(courses.map(course => addCourseToCalendar(calendarId, course)));
        }).then(() => {
            document.getElementById('status').innerText = `Sync complete! Last course added: ${courses[courses.length - 1].section}`;
            isSyncing = false;
            stopQuoteDisplay();
        }).catch(error => {
            console.error('Error:', error);
            document.getElementById('status').innerText = 'Error syncing courses. Please try again.' + JSON.stringify(error);
            isSyncing = false;
            stopQuoteDisplay();
        });
    });
});

async function fetchQuotes() {
    const response = await fetch('quotes.txt');
    const text = await response.text();
    return text.split('\n').filter(line => line.trim() !== '');
}

function startQuoteDisplay(quotes) {
    const quoteElement = document.getElementById('quote');
    const forehandText = "While you wait, here are some Star Wars Clone Wars quotes to enjoy!";

    if (quotes.length > 0) {
        let index = 0;

        quoteInterval = setInterval(() => {
            const randomIndex = Math.floor(Math.random() * quotes.length);
            quoteElement.innerText = `${forehandText}\n${quotes[randomIndex]}`;
        }, 5000);
    }
}

function stopQuoteDisplay() {
    clearInterval(quoteInterval);
    const quoteElement = document.getElementById('quote');
    quoteElement.innerText = ''; // Clear the quote text
}

async function parseExcel(file) {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

    const headers = rows[2].map(header => header.trim());
    const courses = [];

    rows.slice(3).forEach(row => {
        const course = headers.reduce((acc, header, index) => {
            acc[header] = row[index];
            return acc;
        }, {});

        if (course['Registration Status'] === 'Registered' && course['Meeting Patterns']) {
            const meetingPatterns = course['Meeting Patterns'].split('\n');
            meetingPatterns.forEach(pattern => {
                const courseInfos = parseMeetingPattern(pattern, course['Section']);
                if (courseInfos) {
                    courses.push(...courseInfos);
                }
            });
        }
    });

    return courses;
}

function parseMeetingPattern(meetingPattern, section) {
    try {
        const parts = meetingPattern.split(' | ').filter(part => part.trim() !== '');

        if (parts.length < 3) {
            console.log(`Skipping invalid meeting pattern: ${meetingPattern}`);
            return [];
        }

        const [dateRangePart, days, timeRange] = parts;
        let location = '';

        if (parts.length > 3) {
            location = parts.slice(3).join(' | ').trim();
        }

        let [startTime, endTime] = timeRange.split(' - ').map(t => sanitizeTime(t.trim()));

        if (!startTime || !endTime) {
            console.error(`Invalid time range: ${timeRange}`);
            return [];
        }

        const daysMap = {
            'Mon': 'MO',
            'Tue': 'TU',
            'Wed': 'WE',
            'Thu': 'TH',
            'Fri': 'FR',
            'Sat': 'SA',
            'Sun': 'SU'
        };

        const parsedDays = days.split(' ').map(day => daysMap[day]).filter(day => day);

        if (parsedDays.length === 0) {
            console.error(`Invalid days format: ${days}`);
            return [];
        }

        const [startDate, endDate] = dateRangePart.split(' - ').map(d => d.trim());

        if (!startDate || !endDate) {
            console.error(`Invalid date range: ${dateRangePart}`);
            return [];
        }

        const alternateWeeks = days.includes("(Alternate weeks)");

        return [{
            section,
            start_date: startDate,
            end_date: endDate,
            days: parsedDays,
            alternate_weeks: alternateWeeks,
            start_time: convertTo24Hour(startTime, section),
            end_time: convertTo24Hour(endTime, section),
            location
        }];
    } catch (error) {
        console.error(`Error parsing meeting pattern '${meetingPattern}':`, error);
        return [];
    }
}

function sanitizeTime(time) {
    return time.replace(/[^\d:APMampm\s]/g, '').trim();
}

function convertTo24Hour(timeStr, sender = "") {
    if (!timeStr) {
        console.error(`Invalid time string: ${timeStr}`);
        return '00:00'; // Default to midnight if invalid
    }

    const periodMatch = timeStr.match(/(A\.?M\.?|P\.?M\.?)/i);
    if (!periodMatch) {
        console.error(`Invalid period in time string: ${timeStr}`);
        return '00:00'; // Default to midnight if invalid
    }

    const period = periodMatch[0].toUpperCase();
    const time = timeStr.replace(periodMatch[0], '').trim();

    const [hours, minutes] = time.split(':').map(Number);

    if (isNaN(hours) || isNaN(minutes)) {
        console.error(`Invalid hours or minutes in time string: ${timeStr}`);
        return '00:00'; // Default to midnight if invalid
    }

    if (period.includes('P') && hours !== 12) {
        return `${hours + 12}:${String(minutes).padStart(2, '0')}`;
    } else if (period.includes('A') && hours === 12) {
        return `00:${String(minutes).padStart(2, '0')}`;
    } else {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
}

async function addCourseToCalendar(calendarId, course) {
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

    return gapi.client.calendar.events.insert({
        calendarId: calendarId,
        resource: event
    }).then(response => {
        console.log('Event created:', response.result.htmlLink);
    }).catch(error => {
        console.error('Error creating event:', error);
        throw error;
    });
}

function buildRecurrenceRule(days, endDate, alternateWeeks) {
    const rule = `RRULE:FREQ=WEEKLY;BYDAY=${days.join(',')};UNTIL=${endDate.replace(/-/g, '')}T235959Z`;
    if (alternateWeeks) {
        return rule + ';INTERVAL=2';
    }
    return rule;
}
