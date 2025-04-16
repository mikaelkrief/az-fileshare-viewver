export function prettyPrintFileList(fileList) {
    console.log("Available Files:");
    fileList.forEach((file, index) => {
        console.log(`${index + 1}: ${file}`);
    });
}

export function prettyPrintFileContent(content) {
    console.log("File Content:");
    console.log(content);
}