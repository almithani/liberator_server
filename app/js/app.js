'use strict';

const CHARS_PER_PAGE = 30000;


/*
	The purpose of this class is to abstract the "book" UI
*/
class liberator_book_app {

	constructor(targetElementId){ 
		this.bookEl = document.getElementById(targetElementId);
		this.bookContentEl = null;	//we will set this in the init
		this.bookmarkInterval = null; //we will set this up in the init
		this.pages = Array();
		this.curPageNum = 0;
		this.bookURL = 'http://68.183.192.73:8080/The_Big_Picture/xhtml/';
		this.cssURL = 'http://68.183.192.73:8080/The_Big_Picture/css/idGeneratedStyles.css';

		this.lib = new liberator_client(this.bookURL);

		this.isLoadingPage = false;
	}

	init() {
		this.lib.getBookStylesheet(this.cssURL).then( (styles) => {
			var styleEl = document.createElement('style');
			styleEl.innerHTML = styles;
			this.bookEl.appendChild(styleEl);

			/*
				Because of the viewport sizing of bookEl, we need this content
					element so the child HTML style doesn't get messed up
			*/
			this.bookContentEl = document.createElement('div');
			this.bookContentEl.id = "liberator-content";
			this.bookEl.appendChild(this.bookContentEl);

			var appInstance = this;
			this.loadNextPage( function(){ appInstance.initInteractive() });
		});
	}

	initInteractive() {
		this.setUpScrollEventHandler();
		this.loadBookmarkIfExists();
		this.setUpBookmarkingInterval();
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
			//appInstance.loadNextPageIfRequired();
		}
	}

	//"borrowed" from here: https://stackoverflow.com/a/49224652
	getCookie(name) {
		let cookie = {};
		document.cookie.split(';').forEach(function(el) {
			let [k,v] = el.split('=');
			cookie[k.trim()] = v;
		})
		return cookie[name];
	}

	loadBookmarkIfExists() {
		var bookmarkedChar = this.getCookie("curChar");
		console.log(bookmarkedChar)

		var charIterator = document.createNodeIterator(this.bookContentEl, NodeFilter.SHOW_ELEMENT);
		var curNode = charIterator.nextNode(); //this gives us the root node
		var curChar = 0;

		while( curChar < bookmarkedChar ) {
			curNode = charIterator.nextNode();
			curChar += curNode.textContent.trim().length;
		}

		//TODO: change book to something a little more permanent
		book.scrollTop = curNode.offsetTop
	}

	//PRE: this.bookContentEl needs to have already been created (see order in init)
	setUpBookmarkingInterval() {
		var charCounterFunc = this.updateCharCounter;
		var bookContentEl = this.bookContentEl;
		this.bookmarkInterval = setInterval( function(){ charCounterFunc(bookContentEl); }, 5000);
	}

	updateCharCounter(targetEl) {
		var charIterator = document.createNodeIterator(targetEl, NodeFilter.SHOW_ELEMENT);
		var curNode = charIterator.nextNode(); //this gives us the root node
		curNode = charIterator.nextNode(); //this gives us the first child
		var prevNode = null;
		var charCount = 0;

		//TODO: change book to something a little more permanent
		while(!curNode.offsetTop || (curNode.offsetTop < book.scrollTop) ) {
			charCount += curNode.textContent.trim().length;
			prevNode = curNode
			curNode = charIterator.nextNode();
		}

		//POST: prevNode is where we'd like to bookmark 
		console.log(prevNode)
		console.log(prevNode.textContent.length)
		console.log(charCount)

		document.cookie = "curChar="+charCount;
	}

	loadNextPageIfRequired() {
		//don't bother handling this event if it's already being handled.
		if ( this.isLoadingPage ) return false;

		var viewableHeight = this.bookEl.clientHeight;
		var contentHeight = this.bookEl.scrollHeight;
		var totalScrolled = this.bookEl.scrollTop;

		var heightLeft = contentHeight - totalScrolled - viewableHeight;
		
		//this is a percent that we use to decide to load the next 'page'
		var NEXT_PAGE_LOAD_THRESHOLD = 1000; 


		if ( heightLeft <= NEXT_PAGE_LOAD_THRESHOLD ) {
			this.isLoadingPage = true;
			this.loadNextPage();
		}		
	}

	loadNextPage(callback) {
		this.curPageNum++;
		var appInstance = this;

		this.lib.getPage(this.curPageNum).then( (content) => {
			//do i actually need the line below?  Doesn't seem to do anything
			this.processCharacters(content);
			this.bookContentEl.innerHTML += content;

			this.isLoadingPage = false;
			if( callback!=null ) {
				callback();
			}
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

	getCharOfPage(pageNum) {
		return (pageNum - 1) * CHARS_PER_PAGE;
	}

	getPage(pageNum) {
		var charOfPage = this.getCharOfPage(pageNum);

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