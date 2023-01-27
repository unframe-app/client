
import axios, { AxiosResponse } from 'axios';
import fs from 'fs';
import FormData from 'form-data';


export const targetServerUnbook = 'http://localhost:7071/api/Unbook'; 
export const targetServerUnfield = 'http://localhost:7071/api/Unfield';


export interface IFieldInfo {
    level: number; // 10,
    name: string; // "FAKE-COMP-3",
    outputLength: number; // 3,
    numberOfInputBytesNeeded: number; // 2,
    decimalPositionFromEnd: number; // 0,
    decimalType: number; // 2,
    fieldType: number; // 6,
    fieldTypeName: string; // "Comp3Packed",
    isSigned: boolean; // true
    notes: string; // null,
    isValid: boolean; // true,
    isSupported: boolean; // true,
    requiresConversion: boolean; // true
}

// a function that iterates each file with extension .copybook in the target folder and calls the unbook endpoint
// then saves the result to a file with the same name but with extension .fi
export const unbook = async (pathToCopybookFile: string) => {
   
    if (!pathToCopybookFile.endsWith('.copybook')) {
        console.error('path must end with .copybook');
        return;
    }
    console.log(`found copybook file: ${pathToCopybookFile}`);
    // Open file as a readable stream
    const fileStream = fs.createReadStream(pathToCopybookFile);

    var formData = new FormData();
    // Pass file stream directly to form
    formData.append('file', fileStream, <FormData.AppendOptions>{ filepath: pathToCopybookFile , filename: pathToCopybookFile, contentType: 'text/json' });
    try {
        const unbooked: AxiosResponse = await axios.post(targetServerUnbook,formData, {
            headers: {
            'Content-Type': 'multipart/form-data'
            }
        });
        console.log('got # of items: ', unbooked.data.length);
        // write the result to a file with the same name but with extension .fi
        const outputfile =  pathToCopybookFile.replace('.copybook', '-fieldinfo.json');
        // first wipe the file contents if the file exists
        if (fs.existsSync(pathToCopybookFile)) { fs.truncate(outputfile, 0, () => { console.log('file wiped: ', outputfile); }); }

        // open the file for writing
        const writeStream = fs.createWriteStream(outputfile);
        // write the result to the file
        writeStream.write(JSON.stringify(unbooked.data));
        // close the file
        writeStream.close();
        console.log('written to file: ', outputfile);
    } catch (error) {
        console.log('error', error);
    }
}




export const unfield = async (pathToFieldInfoFile: string, pathToBinaryFile: string, pathToOutputFile: string) => {

    //validate the field info file exists
    if (!fs.existsSync(pathToFieldInfoFile)) { throw new Error('FieldInfo file doesnt exist: ' + pathToFieldInfoFile); }

    //validate the binary file exists
    if (!fs.existsSync(pathToBinaryFile)) { throw new Error('Input file doesnt exist: ' + pathToBinaryFile); }

    // pathToFieldInfoFile and read all of its contents into a string
    console.log(`reading file: ${pathToFieldInfoFile}`);
    const fieldInfo = fs.readFileSync(pathToFieldInfoFile, 'utf8');
    console.log('fieldInfo: ', fieldInfo);

    // first wipe the output file if it exists
    if (fs.existsSync(pathToOutputFile)) { fs.truncate(pathToOutputFile, 0, () => { console.log('file wiped: ', pathToOutputFile); }); }

    
    // open the binary file for reading binary byte by byte
    const fd = fs.openSync(pathToBinaryFile, 'r');
    const fdOutput = fs.openSync(pathToOutputFile, 'w');

    try {
        // convert it to a js object
        const fieldInfoObject = JSON.parse(fieldInfo);
        console.log('parsed object with length: ', fieldInfoObject.length);

        // while there are bytes to read then iterate the array of field info objects
        // so first get the file stats
        const stats = fs.statSync(pathToBinaryFile);
        console.log('File Size (bytes): ', stats.size);
        const totalAvailableBytes = stats.size;
        let totalBytesRead = 0;
        let recordCount = 0;
        
        while (totalAvailableBytes - totalBytesRead > 0) {
            // more records to read
            recordCount++;
        
            // iterate the array of field info objects
            for (let index = 0; index < fieldInfoObject.length; index++) {
                const fieldInfo: IFieldInfo = fieldInfoObject[index];
                console.log(`proocessing field: ${fieldInfo.name} which needs ${fieldInfo.numberOfInputBytesNeeded} bytes from the totalRemainingBytes: ${totalAvailableBytes - totalBytesRead}`);
                if (fieldInfo.requiresConversion === false) {
                    console.log(`skipping field: ${fieldInfo.name} as it does not require conversion`);
                    continue;
                }
                const buffer = Buffer.alloc(fieldInfo.numberOfInputBytesNeeded);
                var num = fs.readSync(fd, buffer, 0, fieldInfo.numberOfInputBytesNeeded, null);
                if (num === 0) {
                    throw new Error('Out of bytes while reading for FieldInfo: ' + fieldInfo.name + ' at index: ' + index + ' with totalBytesRead: ' + totalBytesRead + ' and totalBytesToRead: ' + stats.size + '');
                }
                totalBytesRead += num;
                // change the buffer to a string so we can log it
                console.log('bytes read', buffer);
                // convert the buffer to a base64 string
                const base64 = buffer.toString('base64');
                console.log('base64: ', base64);

                // let's convert it by calling to the unfield endpoint
                const unfielded: AxiosResponse = await axios.post(targetServerUnfield, {
                    base64Value: base64,
                    fieldInfo: fieldInfo
                });
                console.log(`writing field to output file: ${fieldInfo.name}`);
                console.log('unfielded: ', unfielded.data);
                // now write the result to the output file
                fs.writeSync(fdOutput, unfielded.data + ',');  // TODO: what about quotes and escaping?


            }
            console.log(`Completed Record: ${recordCount}`);
            // start a new line on the output
            fs.writeSync(fdOutput, '\n');
            
        }
        console.log(`Completed all records: ${recordCount}`);
    } catch (error) {
        console.log('error', error);
    }
    finally {
        fs.closeSync(fd);
        fs.closeSync(fdOutput);
    }


}

export const unframe = async () => {

    const root = 'src/examples/';

    // unbook(root + 'zoned_100klines.copybook');
    // unfield(root + 'zoned_100klines-fieldinfo.json', root + 'zoned_100klines.bin', root + 'zoned_100klines.csv');

    // await unbook(root + 'reg1_reg50.copybook');
    // await unfield(root + 'reg1_reg50-fieldinfo.json', root + 'reg1_reg50.bin', root + 'reg1_reg50.csv');

    // await unbook(root + 'comp3_100klines.copybook');
    // await unfield(root + 'comp3_100klines-fieldinfo.json', root + 'comp3_100klines.bin', root + 'comp3_100klines.csv');

    // const l = await unbook(root + 'occurs_address.copybook');
    // const l1 = await unfield(root + 'occurs_address-fieldinfo.json', root + 'occurs_address.bin', root + 'occurs_address.csv');

    // unbook(root + 'zoned_fewlines.copybook');
    unfield(root + 'zoned_fewlines-fieldinfo.json', root + 'zoned_fewlines.bin', root + 'zoned_fewlines.csv');

}

 unframe();
