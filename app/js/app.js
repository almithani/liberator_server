'use strict';

const CHARS_PER_PAGE = 30000;


/*
	The purpose of this class is to abstract the "book" UI
*/
class liberator_book_app {

	constructor(targetElementId){ 
		this.bookEl = document.getElementById(targetElementId);
		this.pages = Array();
		this.curPageNum = 0;
		this.bookURL = 'http://localhost/The_Big_Picture/xhtml/';
		this.cssURL = 'http://localhost/The_Big_Picture/css/idGeneratedStyles.css';

		this.lib = new liberator_client(this.bookURL);

		this.isLoadingPage = false;
	}

	init() {
		
		this.lib.getBookStylesheet(this.cssURL).then( (styles) => {
			var styleEl = document.createElement('style');
			styleEl.innerHTML = styles;
			this.bookEl.appendChild(styleEl);
		});

		this.loadNextPage();
		this.setUpScrollEventHandler();
	}

	processCharacters(pageContent) {
		var pageObject = {
			content: pageContent
		}

		this.pages.push(pageObject);
	}

	setUpScrollEventHandler() {
		
		var appInstance = this;

		appInstance.bookEl.onscroll = function(e) {
			//don't bother handling this event if it's already being handled.
			if ( appInstance.isLoadingPage ) return false;

			var bookEl = e.target;

			var viewableHeight = bookEl.clientHeight;
			var contentHeight = bookEl.scrollHeight;
			var totalScrolled = bookEl.scrollTop;

			var heightLeft = contentHeight - totalScrolled - viewableHeight;
			
			//this is a percent that we use to decide to load the next 'page'
			var NEXT_PAGE_LOAD_THRESHOLD = 1000; 


			if ( heightLeft <= NEXT_PAGE_LOAD_THRESHOLD ) {
				appInstance.isLoadingPage = true;
				appInstance.loadNextPage();
			}
		}
	}

	loadNextPage() {
		this.curPageNum++;
		var appInstance = this;

		this.lib.getPage(this.curPageNum).then( (content) => {
			this.processCharacters(content);
			var bookContentEl = document.createElement('div');
			bookContentEl.innerHTML = content
			this.bookEl.appendChild(bookContentEl);

			this.isLoadingPage = false;
		})
		.catch( function(error) {
			console.log('error loading next page');
			appInstance.curPageNum--;
		});	
	}
}


/*
	The purpose of this class is to manage the data to and from the server
*/
class liberator_client {

	constructor(bookURL){
		this.bookRootURL = bookURL;
	}

	getPage(pageNum) {
		var charOfPage = (pageNum - 1) * CHARS_PER_PAGE;

		return fetch(this.bookRootURL+charOfPage+'.html')
		.then( resp => resp.text() )
		.then( text => {
			return text;
		})
		.catch(function(error) {
			console.log(error)
			throw error;
		});
	}

	getBookStylesheet(cssURL) {
		return fetch(cssURL)
		.then( resp => resp.text() )
		.then( text => {
			return text;
		}).catch( function(error) {
			console.log(error);
		})
	}
}