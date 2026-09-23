# Privacy Policy

Last updated: 23 September 2026

## Data Collection

No data is collected. The extension does not transmit any data to any server, functional or analytic. No data of any kind reaches me or any third party.

## Information Read

TSSReg runs only on `https://tss.ucsd.edu`. On affected pages the extension uses existing data TSS has already loaded into the page, and - where applicable - data loaded from TSS API calls copied verbatim from the existing site code.

Fields include:
- Course information
- Enrollment status
- Course schedule
- Appointment times and information
- Information required to display the homepage identity card, on TSS backend failure

This information is necessary for the two calendar fixtures and to augment the course filters. It is never copied out of the page, is never transmitted anywhere, and is not retained after you close the tab, apart from the schedules described below. No request is made to any host other than `tss.ucsd.edu`.

## Data Stored

No data is stored by us or any third party. The only persistent data in the extension is your planned schedules, which remain in your browser's `localStorage`, accessible only to the TSS page (scoped to `tss.ucsd.edu` origin). They contain:

- Course codes
- Course meeting times
- Custom scheduled events

These are deleted when you clear the site's data.

## Permissions

- **Host access to `https://tss.ucsd.edu`** is what lets the extension modify TSS pages and read the TSS APIs on your behalf.
- **`declarativeNetRequestWithHostAccess`** allows `https://tss.ucsd.edu` to redirect to `https://tss.ucsd.edu/fiori`. It reads no request contents and applies to no other URL.

## Contact

Questions or concerns: <https://github.com/Minater247/TSSReg/issues>
