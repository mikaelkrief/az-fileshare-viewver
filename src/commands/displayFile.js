const { getShareClient } = require('../services/azureFileService');
const blessed = require('blessed');
const chalk = require('chalk');

/**
 * Display the contents of a file
 * @param {string} shareName - Name of the file share
 * @param {string} filePath - Path to the file
 */
async function displayFile(shareName, filePath) {
  try {
    console.log(chalk.cyan(`Loading file: ${filePath}...`));
    
    const shareClient = getShareClient(shareName);
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
    const downloadResponse = await fileClient.download(0);
    
    // Convert readableStream to string
    const chunks = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const fileContent = buffer.toString();
    
    // Apply syntax highlighting and display file content in a pager-like interface
    await displayContentInPager(fileContent, filePath);
    
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
    return chalk.red(line);
  }
  
  // Highlight warning patterns
  if (/warn|warning|caution/i.test(line)) {
    return chalk.yellow(line);
  }
  
  // Highlight info patterns
  if (/info|information|notice/i.test(line)) {
    return chalk.blue(line);
  }
  
  // Highlight debug patterns
  if (/debug|trace|verbose/i.test(line)) {
    return chalk.gray(line);
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
  
  // Default - no highlighting
  return line;
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
 * Display content in a pager-like interface
 * @param {string} content - File content
 * @param {string} fileName - Name of the file
 */
async function displayContentInPager(content, fileName) {
  // Create a screen
  const screen = blessed.screen({
    smartCSR: true,
    title: `File: ${fileName}`,
    fullUnicode: true
  });
  
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
    formattedLines = content.split('\n');
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
  
  // Add instructions at the bottom
  const instructions = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ' ↑/↓/PgUp/PgDn: Scroll | /: Search | n/N: Next/Prev Match | q: Quit ',
    style: {
      fg: 'black',
      bg: 'green'
    }
  });
  
  // Load the content into the log widget
  formattedLines.forEach(line => {
    logWidget.add(line);
  });
  
  // Focus the log widget
  logWidget.focus();
  
  // Quit on q or ESC
  screen.key(['q', 'escape'], function() {
    if (!searchMode) {
      screen.destroy();
    }
  });
  
  // Add page up/down support
  logWidget.key(['pageup'], function() {
    logWidget.setScroll(Math.max(0, logWidget.getScroll() - logWidget.height));
    screen.render();
  });
  
  logWidget.key(['pagedown'], function() {
    logWidget.setScroll(logWidget.getScroll() + logWidget.height);
    screen.render();
  });
  
  // Handle search functionality
  let searchMode = false;
  let searchInput = '';
  let searchPosition = -1;
  let searchMatches = [];
  
  // Search box for /pattern functionality
  const searchBox = blessed.textbox({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    inputOnFocus: true,
    style: {
      fg: 'white',
      bg: 'blue'
    }
  });
  
  // Make the search box invisible by default
  searchBox.hide();
  
  // Handle search key
  screen.key(['/', 'n', 'N'], function(ch, key) {
    if (key.name === '/') {
      // Enter search mode
      searchMode = true;
      searchInput = '';
      searchBox.setValue('/');
      searchBox.show();
      instructions.hide(); // Hide instructions while searching
      searchBox.focus();
      screen.render();
    } else if (key.name === 'n' || key.name === 'N') {
      // Find next/previous match
      if (searchMatches.length) {
        if (key.name === 'n') {
          searchPosition = (searchPosition + 1) % searchMatches.length;
        } else {
          searchPosition = (searchPosition - 1 + searchMatches.length) % searchMatches.length;
        }
        
        // Scroll to the match position
        logWidget.setScroll(searchMatches[searchPosition]);
        screen.render();
      }
    }
  });
  
  // Handle search submission
  searchBox.key(['enter'], function() {
    const searchText = searchBox.getValue().substring(1); // Remove the leading '/'
    searchBox.hide();
    instructions.show(); // Show instructions again
    searchMode = false;
    
    // Find all matches
    if (searchText) {
      try {
        const regex = new RegExp(searchText, 'gi');
        const contentLines = content.split('\n');
        searchMatches = [];
        
        contentLines.forEach((line, index) => {
          if (regex.test(line)) {
            searchMatches.push(index);
          }
        });
        
        if (searchMatches.length) {
          searchPosition = 0;
          logWidget.setScroll(searchMatches[0]);
          
          // Show number of matches in instructions
          instructions.setContent(` ${searchMatches.length} matches | n/N: Next/Prev | ↑/↓: Scroll | q: Quit `);
        } else {
          // No matches
          instructions.setContent(` No matches found for: "${searchText}" | ↑/↓: Scroll | /: Search | q: Quit `);
        }
      } catch (e) {
        // Invalid regex
        instructions.setContent(` Invalid pattern: ${e.message} | ↑/↓: Scroll | /: Search | q: Quit `);
      }
    }
    
    logWidget.focus();
    screen.render();
  });
  
  // Cancel search on escape
  searchBox.key(['escape'], function() {
    searchBox.hide();
    instructions.show();
    searchMode = false;
    logWidget.focus();
    screen.render();
  });
  
  // Render the screen
  screen.render();
  
  // Wait for the user to quit
  return new Promise(resolve => {
    screen.key(['q', 'escape'], function() {
      if (!searchMode) {
        screen.destroy();
        resolve();
      }
    });
  });
}

module.exports = { displayFile };