# Azure File Share Browser

This is a command-line application that allows users to interact with Azure File Shares. Users can select a file share, view a list of files within that share, and display the contents of selected files.

## Features

- List available Azure File Shares
- View files within a selected file share
- Display the content of selected files in a user-friendly format
- Navigate through directories and subdirectories
- Interactive TUI (Text User Interface) for viewing files
- Support for multiple Azure Storage accounts
- Syntax highlighting for log files and JSON

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   ```

2. Navigate to the project directory:
   ```
   cd azure-file-share-browser
   ```

3. Install the required dependencies:
   ```
   npm install
   ```

## Configuration

You need to provide your Azure Storage credentials in a JSON configuration file:

1. Create a configuration file in your home directory:
   ```
   cp config.example.json ~/.azure-file-browser.json
   ```

2. Edit the `~/.azure-file-browser.json` file with your Azure credentials:
   ```json
   {
     "currentAccount": "account1",
     "accounts": {
       "account1": {
         "accountName": "your_storage_account_name_1",
         "accountKey": "your_storage_account_key_1"
       },
       "account2": {
         "accountName": "your_storage_account_name_2",
         "accountKey": "your_storage_account_key_2"
       }
     }
   }
   ```

   You can add as many accounts as needed in the `accounts` section.

## Usage

To start the application, run the following command in your terminal:
```
node bin/azure-file-browser.js
```

Alternatively, you can use npm:
```
npm start
```

### Interface Navigation

The application provides an interactive, terminal-based user interface:

#### File Share List View
- Use `↑`/`↓` arrow keys to navigate between available file shares
- Press `Enter` to select a file share and browse its contents
- Press `a` to switch between Azure Storage accounts
- Press `q` to exit the application

#### File Browser View
- Use `↑`/`↓` arrow keys to navigate between files and directories
- Press `Enter` to open a file or directory
- Press `q` to go back to the previous directory/view
- Press `Ctrl+C` to exit the application at any time

#### File Viewer
- Use `↑`/`↓` arrow keys to scroll through file contents
- Press `/` to search within the file content
- Press `n`/`N` to move to the next/previous match
- Press `q` to return to the file browser

## Key Features When Viewing Files

- **Syntax highlighting** for log files and JSON
- **Navigation**:
  - Use arrow keys to navigate through the file content
  - Press `q` or `Esc` to exit file view
  - Press `Ctrl+C` to exit the application

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.