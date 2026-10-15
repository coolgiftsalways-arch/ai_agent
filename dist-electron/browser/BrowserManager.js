import { chromium, } from "playwright";
export class BrowserManager {
    browser = null;
    context = null;
    page = null;
    /*
    ==========================================
    ENSURE BROWSER
    ==========================================
    */
    async ensureBrowser() {
        if (this.page &&
            !this.page.isClosed()) {
            return this.page;
        }
        if (!this.browser) {
            this.browser =
                await chromium.launch({
                    headless: false,
                });
        }
        if (!this.context) {
            this.context =
                await this.browser
                    .newContext({
                    viewport: {
                        width: 1440,
                        height: 900,
                    },
                });
        }
        this.page =
            await this.context
                .newPage();
        return this.page;
    }
    /*
    ==========================================
    NORMALIZE URL
    ==========================================
    */
    normalizeUrl(value) {
        const url = value.trim();
        if (/^https?:\/\//i.test(url)) {
            return url;
        }
        return `https://${url}`;
    }
    /*
    ==========================================
    OPEN URL
    ==========================================
    */
    async open(url) {
        const page = await this.ensureBrowser();
        const normalized = this.normalizeUrl(url);
        await page.goto(normalized, {
            waitUntil: "domcontentloaded",
            timeout: 30_000,
        });
        await page
            .bringToFront();
        return {
            title: await page.title(),
            url: page.url(),
        };
    }
    /*
    ==========================================
    CURRENT PAGE
    ==========================================
    */
    async getPage() {
        return await this
            .ensureBrowser();
    }
    /*
    ==========================================
    GET PAGE INFO
    ==========================================
    */
    async getInfo() {
        const page = await this.ensureBrowser();
        return {
            title: await page.title(),
            url: page.url(),
        };
    }
    /*
    ==========================================
    READ PAGE
    ==========================================
    */
    async readPage(maxCharacters = 15_000) {
        const page = await this.ensureBrowser();
        const text = await page
            .locator("body")
            .innerText({
            timeout: 15_000,
        });
        const cleaned = text
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        return {
            title: await page.title(),
            url: page.url(),
            text: cleaned.slice(0, maxCharacters),
        };
    }
    /*
    ==========================================
    CLICK
    ==========================================
    */
    async click(target) {
        const page = await this.ensureBrowser();
        const value = target.trim();
        if (!value) {
            throw new Error("Browser click target is required.");
        }
        /*
        First try visible text / accessible
        element names.
        */
        const textLocator = page
            .getByText(value, {
            exact: true,
        })
            .first();
        if (await textLocator
            .count() >
            0) {
            await textLocator.click({
                timeout: 10_000,
            });
        }
        else {
            /*
            Then allow CSS selector.
            */
            const locator = page
                .locator(value)
                .first();
            await locator.click({
                timeout: 10_000,
            });
        }
        await page.waitForTimeout(500);
        return {
            title: await page.title(),
            url: page.url(),
        };
    }
    /*
    ==========================================
    TYPE / FILL
    ==========================================
    */
    async type(target, text) {
        const page = await this.ensureBrowser();
        const value = target.trim();
        if (!value) {
            throw new Error("Browser input target is required.");
        }
        /*
        Try common form targeting first:
        label, placeholder, then CSS.
        */
        const labelLocator = page
            .getByLabel(value, {
            exact: false,
        })
            .first();
        if (await labelLocator
            .count() >
            0) {
            await labelLocator.fill(text);
        }
        else {
            const placeholderLocator = page
                .getByPlaceholder(value, {
                exact: false,
            })
                .first();
            if (await placeholderLocator
                .count() >
                0) {
                await placeholderLocator.fill(text);
            }
            else {
                await page
                    .locator(value)
                    .first()
                    .fill(text, {
                    timeout: 10_000,
                });
            }
        }
        return {
            title: await page.title(),
            url: page.url(),
        };
    }
    /*
    ==========================================
    PRESS KEY
    ==========================================
    */
    async press(key) {
        const page = await this.ensureBrowser();
        await page.keyboard
            .press(key);
        await page.waitForTimeout(400);
        return {
            title: await page.title(),
            url: page.url(),
        };
    }
    /*
    ==========================================
    GO BACK
    ==========================================
    */
    async back() {
        const page = await this.ensureBrowser();
        await page.goBack({
            waitUntil: "domcontentloaded",
            timeout: 30_000,
        });
        return {
            title: await page.title(),
            url: page.url(),
        };
    }
    /*
    ==========================================
    GO FORWARD
    ==========================================
    */
    async forward() {
        const page = await this.ensureBrowser();
        await page.goForward({
            waitUntil: "domcontentloaded",
            timeout: 30_000,
        });
        return {
            title: await page.title(),
            url: page.url(),
        };
    }
    /*
    ==========================================
    RELOAD
    ==========================================
    */
    async reload() {
        const page = await this.ensureBrowser();
        await page.reload({
            waitUntil: "domcontentloaded",
            timeout: 30_000,
        });
        return {
            title: await page.title(),
            url: page.url(),
        };
    }
    /*
    ==========================================
    CLOSE
    ==========================================
    */
    async close() {
        if (this.context) {
            await this.context
                .close();
        }
        if (this.browser) {
            await this.browser
                .close();
        }
        this.page =
            null;
        this.context =
            null;
        this.browser =
            null;
    }
}
