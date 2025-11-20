/**
 * MODULE: CONTENT WORKER
 * Upgraded for Facebook Marketplace Specifics
 */

console.log("✅ Content Script Loaded & Listening...");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action === "SCRAPE_PAGE") {
        console.log("🔍 Scrape request received for:", window.location.hostname);

        let scrapedData = {
            title: "Title not found",
            price: "Price not found",
            condition: "Condition not found",
            description: "Description not found"
        };

        // --- STRATEGY: FACEBOOK MARKETPLACE ---
        if (window.location.hostname.includes("facebook.com")) {
            
            // 1. TITLE (Usually the primary H1)
            const h1 = document.querySelector("h1");
            if (h1) scrapedData.title = h1.innerText;

            // 2. PRICE (Look for text starting with currency symbols in the main area)
            // We look at all spans, finding one that looks like a price ($150)
            const allSpans = Array.from(document.querySelectorAll("span"));
            
            const priceElement = allSpans.find(el => 
                // Matches $100, $1,200, Free, etc. inside the main listing area
                /^\$?\d+(,\d{3})*(\.\d{2})?$/.test(el.innerText) || el.innerText === "Free"
            );
            // Simple sanity check: Price usually has a larger font size or is near the top
            if (priceElement) scrapedData.price = priceElement.innerText;


            // 3. CONDITION (Find the word "Condition" and grab the text next to it)
            const conditionLabel = allSpans.find(el => el.innerText === "Condition");
            if (conditionLabel) {
                // Facebook structure usually puts the value in the next sibling or parent's text
                // We try to grab the text from the container
                const container = conditionLabel.closest('div[role="listitem"]') || conditionLabel.parentElement;
                if (container) {
                    scrapedData.condition = container.innerText.replace("Condition", "").trim();
                }
            }

            // 4. DESCRIPTION (Find "Seller's Description" header)
            const descHeaders = Array.from(document.querySelectorAll("span, h2, div"));
            const descLabel = descHeaders.find(el => el.innerText === "Seller's Description" || el.innerText === "Description");
            
            if (descLabel) {
                // The description text is usually in a div closely following this header
                // We traverse up to a common container and look for the text block
                // Note: This is a "fuzzy" grab.
                const parentContainer = descLabel.closest('div.x1n2onr6'); // Common wrapper class
                if (parentContainer) {
                    scrapedData.description = parentContainer.innerText
                        .replace("Seller's Description", "")
                        .replace("Description", "")
                        .replace("See more", "")
                        .trim();
                } else {
                     // Fallback: Just grab the parent's text
                     scrapedData.description = descLabel.parentElement.parentElement.innerText;
                }
            }
            
        } 
        // --- FALLBACK FOR TEST PAGE ---
        else {
            const h1 = document.querySelector("h1");
            if (h1) scrapedData.title = h1.innerText;
            const descEl = document.querySelector(".job-description");
            if (descEl) scrapedData.description = descEl.innerText;
        }

        console.log("📄 Data extracted:", scrapedData);

        // Send the data back up to the popup
        // We combine all fields into the 'description' field for the popup demo 
        // (since the popup only has 2 boxes)
        const formattedDescription = `PRICE: ${scrapedData.price}\nCONDITION: ${scrapedData.condition}\n\nDETAILS:\n${scrapedData.description}`;
        
        sendResponse({ 
            status: "success", 
            payload: { 
                title: scrapedData.title, 
                description: formattedDescription
            } 
        });
    }

    if (request.action === "FILL_FORM") {
        const data = request.payload;
        const titleInput = document.getElementById("target-title-input");
        const descInput = document.getElementById("target-desc-textarea");

        if (titleInput && descInput) {
            titleInput.value = data.title;
            descInput.value = data.description; // This will now contain Price/Condition too
            
            titleInput.dispatchEvent(new Event('input', { bubbles: true }));
            descInput.dispatchEvent(new Event('input', { bubbles: true }));
            sendResponse({ status: "success" });
        } else {
            sendResponse({ status: "error" });
        }
    }
});