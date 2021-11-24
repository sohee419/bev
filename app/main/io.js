const { ipcMain } = require( 'electron' );
const path = require( 'path' );
const fs = require( 'fs-extra' );
const os = require( 'os' );
const open = require( 'open' );
const treeify = require('treeify');
const {cruise} = require("dependency-cruiser");
const util = require('util');
const exec = util.promisify(require('child_process').exec);


// Local dependencies
const notification = require( './notification' );

// Get application directory
const appDir = path.resolve( os.homedir(), 'BEV-project-files' );
//const appDir = path.resolve('./BEV-project-files' );

// Folder json name
const folderName = 'folders.json';


//Helper function
const cleanStats = (stats, folder) => {
	const {assets, modules} = stats;
	let totalSize = 0;
	outputObj = {};

	// Set folder property
	outputObj['folder'] = folder;
	outputObj['date'] = new Date().toISOString().slice(0,19).replace('T','').replaceAll(':', '-').replaceAll('-','');

	// Fetch assets 
	outputObj['assets'] = {};
	assets.forEach(asset => {
		const { name, size } = asset;
		const type = name.split('.').pop();
		totalSize += size;
		if (outputObj['assets'].hasOwnProperty(type)) {
			outputObj['assets'][type].push({ 'name': name, 'size': size })
		} else {
			outputObj['assets'][type] = [{'name': name, 'size': size}];
		}
	})

	// Fetch modules
	outputObj['modules'] = [];
	modules.forEach(module => {
		const {size, name} = module;
		outputObj['modules'].push({
			'name': name,
			'size': size
		})
	})

	// Calculate total asset sizes
	outputObj['sizes'] = {};
	for (type in outputObj['assets']) {
		outputObj['sizes'][type] = 0; 
		outputObj['assets'][type].forEach(asset => {
			outputObj['sizes'][type] += asset.size;
		})
	}

	// Set total bundle size
	outputObj['sizes']['total'] = totalSize;
	return outputObj;
}


// Get list of Folders
exports.getFolders = () => {
	 // Ensure `appDir` exists
	fs.ensureDirSync( appDir );

	 // If folder does not exist then create folder
	if(!fs.existsSync(path.resolve(appDir, folderName))){
		fs.writeFileSync(path.resolve(appDir, folderName), JSON.stringify([]));
	}

	const foldersRaw = fs.readFileSync( path.resolve(appDir, folderName));
	const folders = JSON.parse(foldersRaw);
	return folders;
};

// Add folders to folders.json
exports.addFolders = ( foldersArr = [] ) => {
    
	// Ensure `appDir` exists, if not then create appDir --> BEV-project-files
	fs.ensureDirSync( appDir );
	
	// Get the json obj from folders.json
	const foldersRaw = fs.readFileSync( path.resolve(appDir, folderName));

	// Parse to turn json obj into an array of folders
	const folders = JSON.parse(foldersRaw);

	//Check for any exisiting.
	folders.forEach( folder=> {
		if(foldersArr.indexOf(folder)>-1) foldersArr.splice(foldersArr.indexOf(folder), 1);
	})

	// Write into folders.json with the foldersArr concat to the original array of folders
	fs.writeFileSync(path.resolve(appDir, folderName), JSON.stringify(folders.concat(foldersArr)));

};

// Delete folder from folders.json
exports.deleteFolder = ( folderpath ) => {
	const folders = exports.getFolders();
	const index = folders.indexOf(folderpath);
	if(index!=-1) folders.splice(index, 1);
	fs.writeFileSync(path.resolve(appDir, folderName), JSON.stringify(folders), {encoding:'utf8',flag:'w'});

};


// Open a folder
exports.openFolder = ( folderpath ) => {
	console.log('INSIDE OPEN FOLDER OF PATH: ', folderpath)

	// Open a folder using default application
	if( fs.existsSync( folderpath ) ) {
			open( folderpath );
	}
};


// Watch files from the application's storage directory
// it watches for changes in the file but we don't really need it here
// it might be related to the notifications, this is how it tells when the file has been deleted
exports.watchFiles = ( win ) => {
    chokidar.watch( appDir ).on( 'unlink', ( filepath ) => {
        win.webContents.send( 'app:delete-file', path.parse( filepath ).base );
    } );
}

exports.generateDependencyObject = (folderArr) =>{
	const ARRAY_OF_FILES_AND_DIRS_TO_CRUISE = folderArr;
	const cruiseOptions = {
		// includeOnly: ["src", "assets", "node_modules"],
		exclude: {
			// path: ["release", "public", "dist"]
		},
		doNotFollow: {
			path: "node_modules",
		},
		reporterOptions: {
			dot: {
				theme: {
					graph: { rankdir: "TD" },
				},
			},
		},
	};
	let json;
	try {
		const cruiseResult = cruise(
			ARRAY_OF_FILES_AND_DIRS_TO_CRUISE,
			cruiseOptions
		);

		// console.dir(cruiseResult, { depth: 20 });
		// json = JSON.stringify(cruiseResult.output);
		json = cruiseResult.output;

		notification.resultsAdded( folderArr.length );
		
		// console.log('TREEIFY : ', treeify.asTree(cruiseResult.output));
		fs.writeFile('results.json', json, 'utf8', ()=>console.log('JSON generated complete'));
	} catch (error) {
		// console.error(error);
	}
	// console.log('generated json file from io.js', json);
	return json;

}

exports.generateBundleInfoObject = async (folders) =>{

	// Generate stats.json
	// webpack --profile --json > stats.json
	console.log('folders in io.js', folders)	
	let fileName;
	const dateTag = new Date().toISOString().slice(0,19).replace('T','').replaceAll(':', '-').replaceAll('-','');
	const outputBundleObjectsArray = [];
	const outputBundleObjectsArrayRAW = [];
	for(let folder of folders){
		//initialize statsArr to store history of stats for folder
		let statsArr = [];
		fileName = folder.replaceAll(':','');
		fileName = (fileName.split('').includes('\\')) ? `stats-${fileName.replaceAll('\\','-')}` : `stats-${fileName.replaceAll('/','-')}`;
		console.log("stats-folder.replaceAll('\\','-') :", fileName.replaceAll('\\','-'));
		const filepath = path.resolve(appDir, fileName);
		const statspath = path.resolve(folder, 'bev-generated-stats.json');

		//If stats file does not exist then create
		//<Place if statement when we are ready to not generate new stats>--------------------------
			//create stats.json to transfer to the filepath stats array
			const {stdout, stderr} = await exec(`webpack --profile --json > bev-generated-stats.json`,{cwd: folder});

			if (stderr) {
				console.log('stderr: ', stderr);
			} else {
				console.log('stdout: ', stdout);
			}


			//Read from stats file and store in outputBundleObjectsArray
			const rawStats = fs.readFileSync(statspath);
			const stats = JSON.parse(rawStats);
			
			//delete file after we are done
			fs.unlinkSync(statspath);

			//Clean up stats and retrieve only what we need
			const outputObj = cleanStats(stats, folder);

			//if stats history for the folder does not exist then create file
		if(!fs.existsSync( `${filepath}.json` ) ){
			statsArr.push(outputObj);
			fs.writeFile(`${filepath}.json` , JSON.stringify(statsArr), 'utf8', ()=>console.log('New stats file created successfully'));
		}
		//else if it already exist, then read from file, append to it the new outputObj.
		else{
			// Get the json obj from folders.json
			const statsRaw = fs.readFileSync(`${filepath}.json`);

			// Parse to turn json obj into an array of stats history
			statsArr.push(outputObj);
			//Latest stats version is located at index 0
			statsArr = statsArr.concat(JSON.parse(statsRaw));
			fs.writeFile(`${filepath}.json` , JSON.stringify(statsArr), 'utf8', ()=>console.log('New stats history appended.'));
		}

		
		outputBundleObjectsArray.push(statsArr);

	};
	console.log('folders', folders);

	return {bundleStatsRaw: outputBundleObjectsArrayRAW, bundleStats: outputBundleObjectsArray};

}	

/*
  `depCruiserResults` is an Object
  `statsResults` is an Array of Objects
*/
exports.modifyDependencyObject = (depCruiserResults, statsResults) =>{


  // Traverse `dependencies` array in `depCruiserResults.modules`
  depCruiserResults.modules.map(m => {
    // Add `dependencies[n].resolved` to `targetNodeNames`
    m.dependencies.map(d => {
      const source = m.source;
      const target = d.resolved;
      for (let i = 0; i < statsResults.length; i += 1) {

        const statsArrayTargetInfo = statsResults[i].modules.filter(module => module.name.slice(2) === target)
        if (statsArrayTargetInfo.length > 0) {
          statsArrayTargetInfo[0].reasons.forEach(r => {
            const statsArraySource = r.resolvedModule.slice(2);
            if (!d.hasOwnProperty('active')) {
              if (statsArraySource === source && r.type === 'harmony import specifier') {
                const {active} = r;
                d.active = active ?? false;
              }
            } 
          })
        }
      }

      return d
    })

    return m;
  })

  // targetNodeNames = [...new Set(targetNodeNames)] // Remove duplicates

  // To find whether target dependency is used by source: is `active` true or false? 
  // targetNodeNames.forEach(node => {
  //   // Find module Object in `statsResults`

  // })
	
	// Return mutated depCruiserResults Object
	return depCruiserResults;
}

// bundleResults -> Array of Objects
// dependencyResults -> Object
/*
| ./Users/toopham/BEV-project-files
	| home-stats.json
	| search-stats.json
	| nav-stats.json



	| home
		| BEV-project-files
			| stats.json -->array of stats.json + depedencyResults
	| search
		| BEV-project-files
	| nav
		| BEV-project-files
*/
exports.saveStates = ({bundleResults, dependencyResults}) => {
	
	//loop through bundleResults array and save into appropriate folder
}