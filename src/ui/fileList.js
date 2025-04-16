export default function showFileList(files, onSelect) {
    console.log("Select a file to view its content:");
    files.forEach((file, index) => {
        console.log(`${index + 1}: ${file.name}`);
    });

    process.stdin.once('data', (input) => {
        const selectedIndex = parseInt(input.toString().trim(), 10) - 1;
        if (selectedIndex >= 0 && selectedIndex < files.length) {
            onSelect(files[selectedIndex]);
        } else {
            console.log("Invalid selection. Please try again.");
            showFileList(files, onSelect);
        }
    });
}