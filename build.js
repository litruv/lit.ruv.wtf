const fs = require('fs').promises;
const path = require('path');

// Helper function to extract content between delimeters
function extractBlock(content, startDelimiter, endDelimiter) {
    const startIndex = content.indexOf(startDelimiter);
    if (startIndex === -1) return { blockContent: '', remainingContent: content };
    const endIndex = content.indexOf(endDelimiter, startIndex + startDelimiter.length);
    if (endIndex === -1) return { blockContent: '', remainingContent: content }; // Or throw error

    const block = content.substring(startIndex + startDelimiter.length, endIndex).trim();
    const remaining = content.substring(0, startIndex) + content.substring(endIndex + endDelimiter.length);
    return { blockContent: block, remainingContent: remaining.trim() };
}

async function buildPage(pageName, outputName) {
    const layoutPath = path.join(__dirname, 'templates', '_layout.html');
    const commonHeaderPath = path.join(__dirname, 'templates', '_header.html');
    const commonFooterPath = path.join(__dirname, 'templates', '_footer.html');
    const contentPath = path.join(__dirname, 'src', `${pageName}.html`);
    const outputPath = path.join(__dirname, `${outputName}.html`);

    try {
        let layoutContent = await fs.readFile(layoutPath, 'utf-8');
        const srcFileContent = await fs.readFile(contentPath, 'utf-8');

        // Extract metadata
        const metadataRegex = /<!--\s*METADATA:([\s\S]*?)-->/;
        const metadataMatch = srcFileContent.match(metadataRegex);
        let metadata = {};
        let mainPageContent = srcFileContent;

        if (metadataMatch && metadataMatch[1]) {
            try {
                metadata = JSON.parse(metadataMatch[1].trim());
            } catch (e) {
                console.error(`Error parsing metadata JSON for ${pageName}.html:`, e);
            }
            mainPageContent = srcFileContent.replace(metadataRegex, '').trim();
        }
        
        // Defaults for metadata
        const defaults = {
            title: "Litruv",
            metaDescription: "Litruv's personal website.",
            csp: "script-src 'self' 'unsafe-inline';",
            ogTitle: "Litruv",
            ogDescription: "Litruv's personal website.",
            ogUrl: "https://lit.ruv.wtf",
            twitterTitle: "Litruv",
            twitterDescription: "Litruv's personal website.",
            twitterUrl: "https://lit.ruv.wtf",
            pageSpecificStyles: "",
            pageSpecificScriptsDefer: "",
            pageSpecificScriptsBodyEnd: "",
            useCommonHeader: true,
            useCommonFooter: true
        };

        const finalMetadata = { ...defaults, ...metadata };

        // Extract page-specific styles
        const stylesExtraction = extractBlock(mainPageContent, '<!-- START_STYLES -->', '<!-- END_STYLES -->');
        finalMetadata.pageSpecificStyles = stylesExtraction.blockContent;
        mainPageContent = stylesExtraction.remainingContent;

        // Extract page-specific defer scripts
        const deferScriptsExtraction = extractBlock(mainPageContent, '<!-- START_SCRIPTS_DEFER -->', '<!-- END_SCRIPTS_DEFER -->');
        finalMetadata.pageSpecificScriptsDefer = deferScriptsExtraction.blockContent;
        mainPageContent = deferScriptsExtraction.remainingContent;
        
        // Extract page-specific body-end scripts
        const bodyEndScriptsExtraction = extractBlock(mainPageContent, '<!-- START_SCRIPTS_BODY_END -->', '<!-- END_SCRIPTS_BODY_END -->');
        finalMetadata.pageSpecificScriptsBodyEnd = bodyEndScriptsExtraction.blockContent;
        mainPageContent = bodyEndScriptsExtraction.remainingContent;

        // Replace metadata placeholders in layout
        layoutContent = layoutContent.replace(/<!-- ::PAGE_TITLE:: -->/g, finalMetadata.title)
                                     .replace(/<!-- ::META_DESCRIPTION:: -->/g, finalMetadata.metaDescription)
                                     .replace(/<!-- ::PAGE_CSP:: -->/g, finalMetadata.csp)
                                     .replace(/<!-- ::OG_TITLE:: -->/g, finalMetadata.ogTitle)
                                     .replace(/<!-- ::OG_DESCRIPTION:: -->/g, finalMetadata.ogDescription)
                                     .replace(/<!-- ::OG_URL:: -->/g, finalMetadata.ogUrl)
                                     .replace(/<!-- ::TWITTER_TITLE:: -->/g, finalMetadata.twitterTitle)
                                     .replace(/<!-- ::TWITTER_DESCRIPTION:: -->/g, finalMetadata.twitterDescription)
                                     .replace(/<!-- ::TWITTER_URL:: -->/g, finalMetadata.twitterUrl)
                                     .replace(/<!-- ::PAGE_SPECIFIC_STYLES:: -->/g, finalMetadata.pageSpecificStyles)
                                     .replace(/<!-- ::PAGE_SPECIFIC_SCRIPTS_DEFER:: -->/g, finalMetadata.pageSpecificScriptsDefer)
                                     .replace(/<!-- ::PAGE_SPECIFIC_SCRIPTS_BODY_END:: -->/g, finalMetadata.pageSpecificScriptsBodyEnd);

        // Handle common header and footer
        const headerContentToInject = finalMetadata.useCommonHeader ? await fs.readFile(commonHeaderPath, 'utf-8') : '';
        const footerContentToInject = finalMetadata.useCommonFooter ? await fs.readFile(commonFooterPath, 'utf-8') : '';
        
        layoutContent = layoutContent.replace('<!-- ::HEADER:: -->', headerContentToInject);
        layoutContent = layoutContent.replace('<!-- ::FOOTER:: -->', footerContentToInject);
        layoutContent = layoutContent.replace('<!-- ::CONTENT:: -->', mainPageContent);

        await fs.writeFile(outputPath, layoutContent, 'utf-8');
        console.log(`Successfully built ${outputPath}`);
    } catch (error) {
        console.error(`Error building page ${pageName}:`, error);
        throw error;
    }
}

async function main() {
    try {
        const srcDir = path.join(__dirname, 'src');
        const files = await fs.readdir(srcDir);

        const htmlFiles = files.filter(file => file.endsWith('.html'));

        if (htmlFiles.length === 0) {
            console.log("No HTML files found in src directory to build.");
            return;
        }

        for (const file of htmlFiles) {
            const pageName = path.parse(file).name;
            const outputName = pageName;
            await buildPage(pageName, outputName);
        }
        
        console.log("All pages built successfully.");
    } catch (error) {
        console.error('Build process failed:', error);
        process.exit(1);
    }
}

main();
