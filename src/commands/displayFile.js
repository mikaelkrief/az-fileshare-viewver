const { getShareClient } = require('../services/azureFileService');
const blessed = require('blessed');
const chalk = require('chalk');

/**
 * Display file content with options for streaming
 * @param {string} shareName - Name of the file share
 * @param {string} filePath - Path to the file
 * @param {boolean} streamMode - Whether to stream updates in real-time
 */
async function displayFile(shareName, filePath, streamMode = false) {
  try {
    console.log(chalk.cyan(`Loading file: ${filePath}...${streamMode ? ' (streaming mode)' : ''}`));
    
    // Always get a fresh share client (no caching) to ensure we get the latest file content
    const shareClient = getShareClient(shareName, true);
    const filePathParts = filePath.split('/');
    const fileName = filePathParts.pop();
    const directoryPath = filePathParts.join('/');
    
    let directoryClient;
    if (directoryPath) {
      directoryClient = shareClient.getDirectoryClient(directoryPath);
    } else {
      directoryClient = shareClient.rootDirectoryClient;
    }
    
    const fileClient = directoryClient.getFileClient(fileName);

    // Get latest file properties to ensure we have the most recent content
    const properties = await fileClient.getProperties();
    console.log(chalk.gray(`File size: ${properties.contentLength} bytes, Last modified: ${properties.lastModified.toLocaleString()}`));

    // File content download with no caching
    const downloadResponse = await fileClient.download(0);
    
    // Convert readableStream to string
    const chunks = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const fileContent = buffer.toString();
    
    // Determine whether streaming mode should be offered based on file type
    const isLog = isLogFile(fileContent, filePath);
    const canStream = isLog; // Only offer streaming for log files
    
    if (streamMode && !canStream) {
      console.log(chalk.yellow(`Streaming mode is only available for log files.`));
      streamMode = false;
    }
    
    // Apply syntax highlighting and display file content in a pager-like interface
    if (streamMode) {
      await displayContentWithStreaming(fileContent, filePath, fileClient);
    } else {
      // Pass the shareName to the pager function
      const result = await displayContentInPager(fileContent, filePath, canStream, shareName);
      
      // Check if we should switch to streaming mode or refresh
      if (result && result.switchToStream) {
        // Recall this function with streaming mode enabled
        await displayFile(shareName, filePath, true);
      } else if (result && result.refresh) {
        console.log(chalk.cyan(`Refreshing file: ${filePath}...`));
        // Recall this function to refresh the file content
        await displayFile(shareName, filePath, false);
      }
    }
    
  } catch (error) {
    console.error(chalk.red(`Error displaying file ${filePath}: ${error.message}`));
    // Wait for user to acknowledge the error before continuing
    await new Promise(resolve => {
      console.log(chalk.yellow('Press any key to continue...'));
      process.stdin.once('data', () => {
        resolve();
      });
    });
  }
}

/**
 * Apply syntax highlighting to a line based on common log patterns
 * @param {string} line - Line of text to highlight
 * @returns {string} Highlighted line
 */
function highlightLogLine(line) {
  // Highlight error patterns
  if (/error|exception|fail|fatal/i.test(line)) {
    return chalk.red.bold(line);
  }
  
  // Highlight warning patterns
  if (/warn|warning|caution/i.test(line)) {
    return chalk.yellow(line);
  }
  
  // Highlight info patterns
  if (/info|information|notice/i.test(line)) {
    return chalk.blue(line);
  }
  
  // Highlight debug patterns - changed from gray to cyan for better visibility on dark terminals
  if (/debug|trace|verbose/i.test(line)) {
    return chalk.cyan(line);
  }
  
  // Highlight success patterns
  if (/success|succeed|completed|ok/i.test(line)) {
    return chalk.green(line);
  }
  
  // Highlight timestamp patterns (basic)
  if (/\d{4}-\d{2}-\d{2}|\d{2}:\d{2}:\d{2}/.test(line)) {
    return line.replace(/(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Z+-][\d:]+)?)/g, 
      (match) => chalk.cyan(match));
  }
  
  // Default - ensure all text is distinctly visible by using bright white color
  return chalk.whiteBright(line);
}

/**
 * Format JSON content with syntax highlighting
 * @param {string} content - JSON content as string
 * @returns {string} Formatted JSON with syntax highlighting
 */
function formatJson(content) {
  try {
    const json = JSON.parse(content);
    return JSON.stringify(json, null, 2)
      .replace(/"([^"]+)":/g, (match) => chalk.green(match)) // keys
      .replace(/"[^"]*"/g, (match) => chalk.yellow(match))   // string values
      .replace(/\b(true|false)\b/g, (match) => chalk.blue(match))  // booleans
      .replace(/\b(\d+)\b/g, (match) => chalk.magenta(match));    // numbers
  } catch (e) {
    // Not valid JSON, return original content
    return content;
  }
}

/**
 * Detect if content is likely a log file
 * @param {string} content - File content
 * @param {string} fileName - Name of the file
 * @returns {boolean} True if content appears to be a log file
 */
function isLogFile(content, fileName) {
  // Check by extension
  if (/\.(log|txt)$/i.test(fileName)) {
    return true;
  }
  
  // Check content patterns
  const logPatterns = [
    /INFO|DEBUG|ERROR|WARN|WARNING/i,
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    /\[\d{4}-\d{2}-\d{2}\]/
  ];
  
  const sampleLines = content.split('\n').slice(0, 20);
  
  // If multiple lines match log patterns, it's likely a log file
  const logLineCount = sampleLines.filter(line => 
    logPatterns.some(pattern => pattern.test(line))
  ).length;
  
  return logLineCount > 3;
}

/**
 * Detect if content is JSON
 * @param {string} content - File content
 * @param {string} fileName - Name of the file
 * @returns {boolean} True if content is valid JSON
 */
function isJsonFile(content, fileName) {
  if (/\.json$/i.test(fileName)) {
    return true;
  }
  
  try {
    JSON.parse(content);
    return content.trim().startsWith('{') || content.trim().startsWith('[');
  } catch (e) {
    return false;
  }
}

/**
 * Display content in a pager-like interface, with option to switch to streaming mode
 * @param {string} content - File content
 * @param {string} fileName - Name of the file
 * @param {boolean} canStream - Whether streaming mode can be offered
 * @param {string} shareName - The name of the share containing this file
 */
async function displayContentInPager(content, fileName, canStream = false, shareName) {
  // Create a screen
  const screen = blessed.screen({
    smartCSR: true,
    title: `File: ${fileName}`,
    fullUnicode: true
  });
  
  // Add search mode state variable
  let searchMode = false;
  
  // Determine file type and apply formatting
  const isJson = isJsonFile(content, fileName);
  const isLog = isLogFile(content, fileName);
  const fileType = isJson ? 'JSON' : isLog ? 'LOG' : 'TEXT';
  
  // Format content based on file type
  let formattedLines;
  if (isJson) {
    formattedLines = formatJson(content).split('\n');
  } else if (isLog) {
    formattedLines = content.split('\n').map(line => highlightLogLine(line));
  } else {
    // Apply whiteBright to all lines for non-log, non-JSON files
    formattedLines = content.split('\n').map(line => chalk.whiteBright(line));
  }
  
  // Create a log widget for displaying file contents
  const logWidget = blessed.log({
    parent: screen,
    top: 1,          // Leave space for title
    left: 0,
    width: '100%',
    height: screen.height - 2, // Leave space for title and instructions
    border: {
      type: 'line'
    },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      style: {
        bg: 'blue'
      },
      track: {
        bg: 'black'
      }
    },
    mouse: true,
    keys: true,
    vi: true,
    tags: true,
    style: {
      fg: 'white',
      bg: 'black',
      border: {
        fg: 'blue'
      }
    }
  });
  
  // Add a title
  const title = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ` File: ${fileName} [${fileType}] `,
    style: {
      fg: 'white',
      bg: 'blue'
    }
  });
  
  // Add instructions with streaming and refresh options if available
  const instructions = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ` ↑/↓/PgUp/PgDn: Scroll | /: Search | n/N: Next/Prev Match | r: Refresh | q: Quit ${canStream ? ' | s: Stream' : ''} `,
    style: {
      fg: 'black',
      bg: 'green'
    }
  });
  
  // Load the content into the log widget
  formattedLines.forEach(line => {
    logWidget.add(line);
  });
  
  // Scroll to the bottom by default for logs
  if (isLog) {
    logWidget.setScrollPerc(100);
  }
  
  // Focus the log widget
  logWidget.focus();
  
  // Fix the streaming mode key handler
  if (canStream) {
    screen.key(['s'], async function() {
      // Important: Destroy the screen AFTER resolving the promise
      const result = new Promise(resolve => {
        // First set a flag that we're switching to stream mode
        resolve({ switchToStream: true });
      });
      
      screen.destroy();
      return result;
    });
  }
  
  // Add refresh functionality
  screen.key(['r'], function() {
    screen.destroy();
    return new Promise(resolve => {
      resolve({ refresh: true });
    });
  });
  
  // Wait for the user to quit or switch to streaming mode
  return new Promise(resolve => {
    // Quit handler
    screen.key(['q', 'escape'], function() {
      if (!searchMode) {
        screen.destroy();
        resolve({ switchToStream: false, refresh: false });
      }
    });

    // Add the streaming handler result capture
    if (canStream) {
      screen.key(['s'], function() {
        screen.destroy();
        resolve({ switchToStream: true, refresh: false });
      });
    }
    
    // Add the refresh handler
    screen.key(['r'], function() {
      screen.destroy();
      resolve({ switchToStream: false, refresh: true });
    });
  });
}

/**
 * Display content with real-time streaming updates
 * @param {string} initialContent - Initial file content
 * @param {string} fileName - Name of the file
 * @param {object} fileClient - Azure File Client for the file
 */
async function displayContentWithStreaming(initialContent, fileName, fileClient) {
  // Create a screen
  const screen = blessed.screen({
    smartCSR: true,
    title: `File: ${fileName} (Streaming)`,
    fullUnicode: true
  });
  
  // Create a log widget for displaying file contents
  const logWidget = blessed.log({
    parent: screen,
    top: 1,
    left: 0,
    width: '100%',
    height: screen.height - 2,
    border: {
      type: 'line'
    },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      style: {
        bg: 'blue'
      }
    },
    mouse: true,
    keys: true,
    vi: true,
    tags: true,
    style: {
      fg: 'white',
      bg: 'black',
      border: {
        fg: 'blue'
      }
    }
  });
  
  // Add a title with streaming indicator (red background)
  const title = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ` File: ${fileName} [STREAMING] `,
    style: {
      fg: 'white',
      bg: 'red'  // Red background to make it clear we're in streaming mode
    }
  });
  
  // Add instructions
  const instructions = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ' ↑/↓: Scroll | Space: Pause/Resume | q: Quit ',
    style: {
      fg: 'black',
      bg: 'green'
    }
  });
  
  // Load the initial content into the log widget
  initialContent.split('\n').forEach(line => {
    logWidget.add(highlightLogLine(line));
  });
  
  // Scroll to the bottom by default
  logWidget.setScrollPerc(100);
  
  // Focus the log widget
  logWidget.focus();
  
  // Add state variables
  let isPaused = false;
  let currentSize = initialContent.length;
  let lastCheckTime = new Date();
  
  // Add pause/resume functionality
  screen.key(['space'], function() {
    isPaused = !isPaused;
    title.setContent(` File: ${fileName} [${isPaused ? 'PAUSED' : 'STREAMING'}] `);
    screen.render();
  });
  
  // Quit on q or ESC
  screen.key(['q', 'escape'], function() {
    clearInterval(streamingInterval);
    screen.destroy();
  });
  
  // Render the screen
  screen.render();
  
  // Start streaming updates with better error handling
  const streamingInterval = setInterval(async () => {
    if (isPaused) return;
    
    try {
      // Always get the latest file properties to prevent caching issues
      const properties = await fileClient.getProperties({_bypassCache: true});
      const fileSize = properties.contentLength;
      
      // Only try to read if there's new content
      if (fileSize > currentSize) {
        logWidget.add(chalk.cyan(`[${new Date().toLocaleTimeString()}] New content detected (${fileSize - currentSize} bytes)`));
        
        // Download only the new content - with cache bypass option
        const downloadResponse = await fileClient.download(currentSize, fileSize - currentSize, {_bypassCache: true});
        
        const chunks = [];
        for await (const chunk of downloadResponse.readableStreamBody) {
          chunks.push(chunk);
        }
        
        if (chunks.length > 0) {
          const buffer = Buffer.concat(chunks);
          const newContent = buffer.toString();
          
          newContent.split('\n').forEach(line => {
            if (line.trim()) { // Skip empty lines
              // Ensure all new content is also properly highlighted
              logWidget.add(highlightLogLine(line));
            }
          });
          
          // Update our tracking of the current size
          currentSize = fileSize;
          lastCheckTime = new Date();
          
          // Update the title with last update time
          title.setContent(` File: ${fileName} [STREAMING] - Last update: ${lastCheckTime.toLocaleTimeString()} `);
        }
        
        // Auto-scroll to the bottom
        logWidget.setScrollPerc(100);
        screen.render();
      }
    } catch (error) {
      // Log the error in the widget instead of crashing
      logWidget.add(chalk.red(`[${new Date().toLocaleTimeString()}] Error checking for updates: ${error.message}`));
      logWidget.add(chalk.yellow('Trying again in 2 seconds...'));
      screen.render();
      
      // Reset our position if we got a range error - the file might have been truncated
      if (error.message.includes('range specified is invalid')) {
        try {
          const properties = await fileClient.getProperties({_bypassCache: true});
          currentSize = properties.contentLength;
          logWidget.add(chalk.yellow(`[${new Date().toLocaleTimeString()}] Resetting file position to ${currentSize} bytes`));
          screen.render();
        } catch (resetError) {
          logWidget.add(chalk.red(`[${new Date().toLocaleTimeString()}] Error resetting position: ${resetError.message}`));
          screen.render();
        }
      }
    }
  }, 2000);
  
  // Return a promise that resolves when the user quits
  return new Promise(resolve => {
    screen.key(['q', 'escape'], function() {
      clearInterval(streamingInterval);
      screen.destroy();
      resolve();
    });
  });
}

module.exports = { displayFile };