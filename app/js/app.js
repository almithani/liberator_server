'use strict';

const CHARS_PER_PAGE = 30000;


/*
	The purpose of this class is to abstract the "book" UI
*/
class liberator_book_app {

	constructor(targetElementId){ 
		this.bookEl = document.getElementById(targetElementId);
		this.bookContentEl = null;	//we will set this in the init
		this.pages = Array();
		this.curPageNum = 0;
		this.bookURL = 'http://68.183.192.73:8080/The_Big_Picture/xhtml/';
		this.cssURL = 'http://68.183.192.73:8080/The_Big_Picture/css/idGeneratedStyles.css';

		this.lib = new liberator_client(this.bookURL);
		this.bookmarker = new liberator_bookmarker();

		this.isLoadingPage = false;
	}

	init() {
		var bookmarkedChar = this.bookmarker.getSavedBookmarkChar();

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
			this.loadPageByChar(bookmarkedChar, function(){ appInstance.initInteractive() });
		});
	}

	initInteractive() {
		this.setUpScrollEventHandler();
		this.bookmarker.setBookmarkElement(this.bookContentEl);
		var curBookmarkOffset = this.bookmarker.getBookmarkOffset();
		this.bookEl.scrollTop = curBookmarkOffset;
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
			appInstance.loadNextPageIfRequired();
		}
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
			this.loadPageByNum(this.curPageNum+1);
		}		
	}

	loadPageByNum(pageNum, callback) {
		this.isLoadingPage = true;
		var appInstance = this;

		this.lib.getPage(pageNum).then( (content) => {

			appInstance.curPageNum = pageNum;
			appInstance.bookContentEl.innerHTML += content;
			appInstance.isLoadingPage = false;

			if( callback!=null ) {
				callback();
			}
		})
		.catch( function(error) {
			console.log('error loading page num: '+pageNum+' - '+error);

		});	
	}

	//this loads pages by character number (like in bookmarks)
	loadPageByChar(curChar, callback) {
		this.isLoadingPage = true;
		var appInstance = this;

		this.lib.getPageByChar(curChar).then( (page) => {

			appInstance.curPageNum = page.pageNum;
			appInstance.bookContentEl.innerHTML += page.content;
			appInstance.isLoadingPage = false;

			if( callback!=null ) {
				callback();
			}
		})
		.catch( function(error) {
			console.log('error loading page at char: '+curChar+' - '+error);
		});	
	}
}


/*
	The purpose of this class is to manage bookmarking.  It saves/loads bookmarks in a cookie

	PRE: contentElement MUST exist, and must be child to a scrollable parent
*/
class liberator_bookmarker {

	constructor(){ 
		this.BOOKMARK_COOKIE_NAME = "curChar";
		this.savedBookmarkChar = this.getSavedBookmarkChar();

		//these will be initialized in setBookmarkElement
		this.contentEl = null;
		this.scrollEl = null;
		this.bookmarkInterval = null; 
		
	}

	//this function can be called by consumers to start auto-bookmarking
	// if it's called before getSavedBookmarkChar, it could overwrite initial value
	setBookmarkElement(contentElement) {

		this.contentEl = contentElement;
		this.scrollEl = contentElement.parentElement;

		var bookmarkerInstance = this;
		this.bookmarkInterval = setInterval( function(){ 
			bookmarkerInstance.updateCharCounter(); 
		}, 5000);
	}

	getSavedBookmarkChar() {
		var bookmarkedChar = this.savedBookmarkChar;
		if( bookmarkedChar == undefined ) {
			bookmarkedChar = this.getCookie(this.BOOKMARK_COOKIE_NAME);
			if( bookmarkedChar==undefined ) {
				return 0;
			}
			console.log("retrieved bookmark char: "+bookmarkedChar);
		}
		return bookmarkedChar;
	}

	getBookmarkOffset() {
		//error case in case we don't have a content element
		if(this.contentEl==null) { return -1; }
		
		var bookmarkedChar = this.savedBookmarkChar;

		var charCount = 0;
		var childIterator = 0;
		var traversalNode = this.contentEl;
		var curChild = traversalNode.children[childIterator];

		while(true) {

			//There's something wrong with this traversal...the error case is getting called 100% of the time
			// idea: maybe to do with malformed HTML (i.e. self-closing tags?)

			if ( charCount+curChild.textContent.length==bookmarkedChar ) {
				//we have the node!
				break;
			} else if ( charCount+curChild.textContent.length > bookmarkedChar ) {
				//we've gone past the target node, drop traversal down into this node
				childIterator = 0;
				traversalNode = curChild;
				var prevChild = curChild;
				curChild = traversalNode.children[childIterator];

				if(curChild == undefined) {
					//error case to account for small inaccuracies
					curChild = prevChild;
					break;
				}
				continue;
			} else {
				//we haven't yet passed our node
				charCount += curChild.textContent.length;
				childIterator++;
				var prevChild = curChild;
				curChild = traversalNode.children[childIterator];

				if(curChild == undefined) {
					//error case to account for small inaccuracies
					curChild = prevChild;
					break;
				}
				continue;
			}
		}
		//POST: curChild is the node we want to scroll to

		//offsetTop seems to not be defined for text nodes...
		// TODO: fix this
		if( curChild.offsetTop ) {
			return curChild.offsetTop
		}

		return 0;
	}

	updateCharCounter() {
		var charIterator = document.createNodeIterator(this.contentEl, NodeFilter.SHOW_ELEMENT);
		var curNode = charIterator.nextNode(); //this gives us the root node
		curNode = charIterator.nextNode(); //this gives us the first child
		var bookmarkNode = curNode;

		while(!curNode.offsetTop || (curNode.offsetTop < this.scrollEl.scrollTop) ) {
			curNode = charIterator.nextNode();
			bookmarkNode = curNode;
		}
		//POST: bookmarkNode is where we'd like to bookmark 

		var curParent = bookmarkNode;
		var ancestorList = [];
		while( curParent != this.contentEl ) {
			console.log(curParent);
			ancestorList.push(curParent);
			curParent = curParent.parentNode;
		}
		//POST: ancestorList contains ancestors of bookmarkNode

		var charCount = 0;
		var childIterator = 0;
		var traversalNode = this.contentEl;//bookmarkParent;
		var curChild = traversalNode.children[childIterator];
		while(true) {
			if( curChild == bookmarkNode ) {
				//if it's our bookmark node, we're done
				break;
			} else if ( !ancestorList.includes(curChild) ) {
				//if the node is not an ancestor, just include all text and move to next sibling
				charCount += curChild.textContent.length;
				childIterator++;
				curChild = traversalNode.children[childIterator];
				continue;
			} else {
				//if the node is an ancestor, traverse its children
				childIterator = 0;
				traversalNode = curChild;
				curChild = traversalNode.children[childIterator];
				continue;
			}
		}
		//POST: charCount includes all chars before bookmarkNode 

		//console.log(bookmarkNode);
		console.log('bookmarking at char: '+charCount);
		document.cookie = this.BOOKMARK_COOKIE_NAME+"="+charCount;
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

	getPageUrlByChar(char) {
		var charURL = Math.floor(char/CHARS_PER_PAGE) * CHARS_PER_PAGE;
		return this.bookRootURL+charURL+'.html';
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

	getPageByChar(char) {
		var pageNum = Math.floor(char/CHARS_PER_PAGE)+1;
		return fetch(this.getPageUrlByChar(char))
			.then( resp => resp.text() )
			.then( text => {
				return { content: text, pageNum: pageNum};
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