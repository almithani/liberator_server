'use strict';

class liberator_client {

	constructor(){

	}

	getBookContent() {
		return fetch('http://localhost/The_Big_Picture/xhtml/0.html')
		.then( resp => resp.text() )
		.then( text => {
			return text;
		})
		.catch(function(error) {
			console.log(error)
		});
	}

	getBookStylesheet() {
		return fetch('http://localhost/The_Big_Picture/css/idGeneratedStyles.css')
		.then( resp => resp.text() )
		.then( text => {
			return text;
		}).catch( function(error) {
			console.log(error);
		})
	}
}