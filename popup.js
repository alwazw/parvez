// POPUP CONTROLLER
function logStatus(message) {
    const statusEl = document.getElementById("status-log");
    if (statusEl) {
        statusEl.innerText = "[" + new Date().toLocaleTimeString() + "] " + message;
    }
}

async function getActiveTab() {
    const queryOptions = { active: true, currentWindow: true };
    const [tab] = await chrome.tabs.query(queryOptions);
    return tab;
}

document.getElementById("btn-scrape").addEventListener("click", async () => {
    const tab = await getActiveTab();
    logStatus("Requesting scrape...");
    chrome.tabs.sendMessage(tab.id, { action: "SCRAPE_PAGE" }, (response) => {
        if (chrome.runtime.lastError) {
            logStatus("Error: Is the page loaded?");
            return;
        }
        if (response && response.status === "success") {
            chrome.storage.local.set({ 'scraped_cache': response.payload }, () => {
                logStatus("Saved: " + response.payload.title);
            });
        } else {
            logStatus("Failed to scrape.");
        }
    });
});

document.getElementById("btn-fill").addEventListener("click", async () => {
    const tab = await getActiveTab();
    chrome.storage.local.get(['scraped_cache'], (result) => {
        if (!result.scraped_cache) {
            logStatus("Error: No data saved.");
            return;
        }
        logStatus("Sending data...");
        chrome.tabs.sendMessage(tab.id, { action: "FILL_FORM", payload: result.scraped_cache }, (response) => {
            logStatus(response && response.status === "success" ? "Success! Form filled." : "Error filling form.");
        });
    });
});