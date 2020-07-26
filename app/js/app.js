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
		this.bookmarker = new liberator_bookmarker(this.bookContentEl);

		//TODO: make the line below not "time-sensitive"
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
	The purpose of this class is to manage bookmarking.  It saves/loads bookmarks in a cookie

	PRE: contentElement MUST exist, and must be child to a scrollable parent
*/
class liberator_bookmarker {

	constructor(contentElement){ 
		this.contentEl = contentElement;
		this.scrollEl = contentElement.parentElement;
		this.bookmarkInterval = null; //we will init this in setUpBookmarkingInterval
		this.BOOKMARK_COOKIE_NAME = "curChar";

		this.setUpBookmarkingInterval();
	}

	setUpBookmarkingInterval() {
		var bookmarkerInstance = this;
		this.bookmarkInterval = setInterval( function(){ 
			bookmarkerInstance.updateCharCounter(); 
		}, 5000);
	}

	getBookmarkOffset() {
		var bookmarkedChar = this.getCookie(this.BOOKMARK_COOKIE_NAME);
		console.log("retrieved bookmark char: "+bookmarkedChar)

		var charCount = 0;
		var childIterator = 0;
		var traversalNode = this.contentEl;
		var curChild = traversalNode.children[childIterator];
		while(true) {
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
				curChild = traversalNode.children[childIterator];
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
		var bookmarkNode = null;

		while(!curNode.offsetTop || (curNode.offsetTop < this.scrollEl.scrollTop) ) {
			bookmarkNode = curNode;
			curNode = charIterator.nextNode();
		}
		//POST: bookmarkNode is where we'd like to bookmark 

		var curParent = bookmarkNode;
		var ancestorList = [];
		while( curParent != this.contentEl ) {
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