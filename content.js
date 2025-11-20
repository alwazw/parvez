/**
 * MODULE: CONTENT WORKER
 * Upgraded for Facebook Marketplace Specifics
 */

console.log("✅ Content Script Loaded & Listening...");

// Helper to find elements by matching label text to input
function findInputByLabelText(labelText) {
    // Strategy 1: Look for <label> containing text
    const labels = Array.from(document.querySelectorAll("label"));
    const targetLabel = labels.find(l => l.innerText.includes(labelText));

    if (targetLabel) {
        // Check 'for' attribute
        if (targetLabel.htmlFor) {
            return document.getElementById(targetLabel.htmlFor);
        }
        // Check for nested input
        const nested = targetLabel.querySelector("input, textarea, select");
        if (nested) return nested;
    }

    // Strategy 2: Look for aria-label on input directly
    // We use 'i' flag for case insensitive matching if supported, otherwise simple check
    const ariaInput = document.querySelector(`input[aria-label*="${labelText}" i], textarea[aria-label*="${labelText}" i]`);
    if (ariaInput) return ariaInput;

    // Strategy 3: Placeholder
    const placeholderInput = document.querySelector(`input[placeholder*="${labelText}" i], textarea[placeholder*="${labelText}" i]`);
    if (placeholderInput) return placeholderInput;

    return null;
}

// Helper to set React value
function setReactValue(element, value) {
    const lastValue = element.value;
    element.value = value;

    const event = new Event("input", { bubbles: true });

    // React 16+ Hack: React overrides the native value setter.
    // We need to call the native setter to ensure React's internal state tracker picks up the change.
    const tracker = element._valueTracker;
    if (tracker) {
        tracker.setValue(lastValue);
    }

    // New method for modern React:
    let descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
    // If it's a textarea, we need that prototype
    if (element.tagName === "TEXTAREA") {
        descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
    }

    if (descriptor && descriptor.set) {
        descriptor.set.call(element, value);
    } else {
        // Fallback
        element.value = value;
    }

    element.dispatchEvent(event);
    // Also dispatch change for good measure
    element.dispatchEvent(new Event("change", { bubbles: true }));
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action === "SCRAPE_PAGE") {
        console.log("🔍 Scrape request received for:", window.location.hostname);

        let scrapedData = {
            title: "",
            price: "",
            condition: "",
            description: ""
        };

        // --- STRATEGY: FACEBOOK MARKETPLACE ---
        if (window.location.hostname.includes("facebook.com")) {
            
            // 1. TITLE
            const ogTitle = document.querySelector('meta[property="og:title"]');
            if (ogTitle) {
                scrapedData.title = ogTitle.content;
            } else {
                const h1 = document.querySelector("h1");
                if (h1) scrapedData.title = h1.innerText;
            }

            // 2. PRICE
            const productPrice = document.querySelector('meta[property="product:price:amount"]');
            if (productPrice) {
                 scrapedData.price = productPrice.content;
            } else {
                // Fallback to text search
                const allSpans = Array.from(document.querySelectorAll("span"));
                const priceElement = allSpans.find(el =>
                    /^\$?\d+(,\d{3})*(\.\d{2})?$/.test(el.innerText) || el.innerText === "Free"
                );
                if (priceElement) scrapedData.price = priceElement.innerText;
            }

            // 3. DESCRIPTION
            const ogDesc = document.querySelector('meta[property="og:description"]');
            if (ogDesc) {
                scrapedData.description = ogDesc.content;
            } else {
                 // Fallback to finding "Seller's Description"
                 const descHeaders = Array.from(document.querySelectorAll("span, h2, div"));
                 const descLabel = descHeaders.find(el => {
                     const t = el.innerText.trim();
                     return t === "Seller's Description" || t === "Description";
                 });

                 if (descLabel) {
                     // Try to find the content container
                     const parentContainer = descLabel.closest('div.x1n2onr6') || descLabel.parentElement.parentElement;
                     if (parentContainer) {
                         scrapedData.description = parentContainer.innerText
                             .replace("Seller's Description", "")
                             .replace("Description", "")
                             .replace("See more", "")
                             .trim();
                     }
                 }
            }

            // 4. CONDITION
            // Condition is tricky, usually not in meta.
            // We look for the word "Condition" in the text.
            const allSpans = Array.from(document.querySelectorAll("span"));
            const conditionLabel = allSpans.find(el => el.innerText === "Condition");
            if (conditionLabel) {
                // Often structured as Label: Value or in a list
                // Try to get the next sibling text or container text
                const container = conditionLabel.closest('div[role="listitem"]') || conditionLabel.parentElement;
                if (container) {
                    // Extract text that isn't "Condition"
                    let text = container.innerText.replace("Condition", "").trim();
                    // Clean up common prefixes if they exist like "Condition: Used - Good"
                    text = text.replace(/^[:\s]+/, "");
                    scrapedData.condition = text;
                }
            }
            
        } 
        // --- FALLBACK FOR TEST PAGE ---
        else {
            const h1 = document.querySelector("h1");
            if (h1) scrapedData.title = h1.innerText;
            const descEl = document.querySelector(".job-description");
            if (descEl) scrapedData.description = descEl.innerText;
            // Mock others
            scrapedData.price = "$150";
            scrapedData.condition = "Used";
        }

        console.log("📄 Data extracted:", scrapedData);

        // Combine into the object expected by the popup/filling logic
        // We keep the raw fields separate in the payload for better filling later
        sendResponse({ 
            status: "success", 
            payload: scrapedData
        });
    }

    if (request.action === "FILL_FORM") {
        const data = request.payload;
        console.log("✍️ Filling form with data:", data);

        // Check if we are on the Test Page
        const testTitleInput = document.getElementById("target-title-input");
        if (testTitleInput) {
             testTitleInput.value = data.title;
             const testDescInput = document.getElementById("target-desc-textarea");
             if (testDescInput) {
                 testDescInput.value = `PRICE: ${data.price}\nCONDITION: ${data.condition}\n\n${data.description}`;
             }
             sendResponse({ status: "success" });
             return;
        }

        // --- STRATEGY: FACEBOOK CREATE LISTING ---
        // We try to find inputs by commonly known labels

        let filledCount = 0;

        // 1. TITLE
        const titleInput = findInputByLabelText("Title");
        if (titleInput) {
            setReactValue(titleInput, data.title);
            filledCount++;
        } else {
            console.warn("Could not find Title input");
        }

        // 2. PRICE
        const priceInput = findInputByLabelText("Price");
        if (priceInput) {
             // Clean price string to number if necessary
             const cleanPrice = data.price.replace(/[^0-9.]/g, "");
             setReactValue(priceInput, cleanPrice);
             filledCount++;
        } else {
            console.warn("Could not find Price input");
        }

        // 3. DESCRIPTION
        const descInput = findInputByLabelText("Description");
        if (descInput) {
            const fullDesc = `Condition: ${data.condition}\n\n${data.description}`;
            setReactValue(descInput, fullDesc);
            filledCount++;
        } else {
             console.warn("Could not find Description input");
        }

        // 4. CONDITION (Dropdown)
        // This is hard to automate reliably without more selectors.
        // We skip specific selection but the info is in the description now.

        if (filledCount > 0) {
            sendResponse({ status: "success" });
        } else {
            sendResponse({ status: "error", message: "No matching inputs found" });
        }
    }
});
