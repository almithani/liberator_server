'use strict';


/*
	The purpose of this class is to abstract the "book" UI
*/
class liberator_book_app {

	constructor(targetElementId){ 
		this.bookEl = document.getElementById(targetElementId);
		this.pages = Array();
	}

	init() {
		const lib = new liberator_client();
		
		lib.getBookStylesheet().then( (styles) => {
			var styleEl = document.createElement('style');
			styleEl.innerHTML = styles;
			this.bookEl.appendChild(styleEl);
		});

		lib.getBookContent().then( (content) => {
			this.processCharacters(content);
			var bookContentEl = document.createElement('div');
			bookContentEl.innerHTML = content
			this.bookEl.appendChild(bookContentEl);
		});	

		this.bookEl.onscroll = this.scrollEventHandler;
	}

	processCharacters(pageContent) {
		var pageObject = {
			content: pageContent
		}

		this.pages.push(pageObject);
	}

	scrollEventHandler(e) {

		var bookEl = e.target;

		var viewableHeight = bookEl.clientHeight;
		var contentHeight = bookEl.scrollHeight;
		var totalScrolled = bookEl.scrollTop;

		var heightLeft = contentHeight - totalScrolled - viewableHeight;
		
		//this is a percent that we use to decide to load the next 'page'
		var NEXT_PAGE_LOAD_THRESHOLD = 1000; 


		if ( heightLeft <= NEXT_PAGE_LOAD_THRESHOLD ) {
			console.log('load next page');
		}
	}
}


/*
	The purpose of this class is to manage the data to and from the server
*/
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