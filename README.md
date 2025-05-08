# gaia_extension

## TLDR;

The extension uses the chrome.debugger API to attach to ChatGPT tabs. Once attached, it listens for network events, specifically looking for requests to the target URL. When such a request occurs, it captures the outgoing request data. After the server responds and the response is fully loaded, the extension fetches the response body. This captured request/response pair is then stored and made available for display in the extension's popup window.

## Key Components

### 1. `manifest.json` - The Extension's Blueprint

This file defines the extension's configuration, permissions, and background scripts.

- **`manifest_version: 3`**: Specifies the latest Manifest V3 standard.
- **`name`, `version`, `description`**: Basic extension metadata.
- **`permissions`**:
  - **`debugger`**: Allows attaching to Chrome's debugging tools for network inspection (requires user consent due to its powerful nature).
  - **`storage`**: Enables local storage of captured data using `chrome.storage.local`.
  - **`tabs`**: Permits interaction with browser tabs to identify ChatGPT pages.
- **`host_permissions`**:
  - **`https://chatgpt.com/*`**: Restricts debugger access and other capabilities to the ChatGPT domain for security.
- **`background`**:
  - **`service_worker: "background.js"`**: Specifies the background service worker script for event handling.
- **`action`**:
  - **`default_popup: "popup.html"`**: Defines the HTML page to display when the extension icon is clicked.
  - **`default_title: "ChatGPT Monitor"`**: Sets the tooltip for the extension icon.

### 2. `background.js` - The Engine Room (Service Worker)

This script runs in the background and handles the core logic of network monitoring.

- **`debuggingTabIds`**: A `Set` to track tabs where the debugger is attached.
- **`requestDataStore`**: An object to temporarily store request details (payload) using `requestId` as the key.
- **`TARGET_URL`**: The specific API endpoint to monitor: `https://chatgpt.com/backend-api/conversation`.
- **`DEBUGGER_VERSION`**: Specifies the Chrome Debugging Protocol version.
- **`ensureDebuggerAttached(tabId, tabUrl)`**: Attaches the debugger to a ChatGPT tab if not already attached and enables network event tracking. Detaches the debugger if the tab is no longer a ChatGPT page.
- **`detachDebugger(tabId)`**: Detaches the debugger from a specified tab.
- **`chrome.debugger.onEvent.addListener((debuggeeId, message, params) => { ... })`**: The primary event listener for debugger messages:
  - **`Network.requestWillBeSent`**: When a request is about to be sent to `TARGET_URL`, it stores the `postData` in `requestDataStore`.
  - **`Network.loadingFinished`**: When a response finishes loading for a tracked request, it retrieves the response body using `chrome.debugger.sendCommand("Network.getResponseBody", ...)` and pairs it with the stored request data. This captured data is then saved to `chrome.storage.local` and a message is sent to the popup (if open).
- **`chrome.debugger.onDetach.addListener((source, reason) => { ... })`**: Cleans up `debuggingTabIds` and `requestDataStore` when the debugger detaches.
- **Tab Event Listeners (`chrome.tabs.onUpdated`, `chrome.tabs.onRemoved`)**: Manage debugger attachment/detachment based on tab URL changes and tab closure.
- **Extension Lifecycle Listeners (`chrome.runtime.onStartup`, `chrome.runtime.onInstalled`)**: Attempt to attach the debugger to any existing ChatGPT tabs when Chrome starts or the extension is installed/updated.
- **Message Listener for Popup (`chrome.runtime.onMessage.addListener`)**: Handles a "REQUEST_DEBUGGER_CHECK" message from the popup to manually re-initiate debugger attachment for the active tab.

### 3. `popup.html` - The User Interface Structure

The HTML structure for the extension's popup window.

- Basic HTML structure with a link to `popup.css` and inclusion of `popup.js`.
- Displays a title, a status message area, sections for request and response payloads (using `<pre>` for formatting), a timestamp, and buttons to clear displayed data and re-check debugger status.

### 4. `popup.css` - Styling the Interface

Provides CSS styles to enhance the readability and layout of `popup.html`, including formatting for JSON output and button styles.

### 5. `popup.js` - Making the Interface Interactive

This script manages the behavior and content of the popup.

- **`document.addEventListener('DOMContentLoaded', () => { ... })`**: Ensures the script runs after the HTML is fully loaded.
- **Element References**: Gets references to HTML elements for dynamic updates.
- **`displayData(data)`**: Formats and displays the captured request and response data in the popup.
- **Loading Initial Data**: Retrieves and displays the last captured data from `chrome.storage.local` when the popup is opened.
- **Listening for Real-time Updates**: Uses `chrome.runtime.onMessage.addListener` to receive "DATA_UPDATED" messages from `background.js` and update the displayed data in real-time.
- **Button Event Listeners**:
  - **Clear Data Button**: Clears the displayed request and response data in the popup.
  - **Reattach Button**: Sends a "REQUEST_DEBUGGER_CHECK" message to `background.js` to attempt re-attaching the debugger.

## Overall Workflow

1.  **User Interaction**: You interact with ChatGPT, triggering a network request to `https://chatgpt.com/backend-api/conversation`.
2.  **Request Interception (background.js)**: If the debugger is attached to the ChatGPT tab, the `Network.requestWillBeSent` event is triggered. The background script checks if the URL matches `TARGET_URL` and, if so, stores the request payload.
3.  **Server Response**: The ChatGPT server responds to the request.
4.  **Response Capture (background.js)**: The `Network.loadingFinished` event fires. The background script retrieves the stored request data and uses `chrome.debugger.sendCommand("Network.getResponseBody", ...)` to get the response body.
5.  **Data Storage and Notification (background.js)**: The request and response data are saved to `chrome.storage.local`, and a "DATA_UPDATED" message is sent to any open popup.
6.  **Popup Display (popup.js)**:
    - When the popup is opened, `popup.js` loads and displays the last captured data from `chrome.storage.local`.
    - If the popup is already open, it receives the "DATA_UPDATED" message and updates the displayed information immediately.

This extension provides a way to easily inspect the network communication between your browser and the ChatGPT backend, aiding in understanding the data being exchanged.
