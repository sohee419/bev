const { Notification } = require( 'electron' );

// Display files added notification
exports.foldersAdded = ( size ) => {
    const notif = new Notification( {
        title: 'Folders added',
        body: `${ size } folders(s) has been successfully added.`
    } );

    notif.show();
};

// Display files added notification
exports.resultsAdded = ( size ) => {
	const notif = new Notification( {
        title: 'Analyzed Successful',
        body: `${ size } folders(s) has been successfully analyzed for dependencies.`
	} );

	notif.show();
};
