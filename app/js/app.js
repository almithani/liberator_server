'use strict';

const CHARS_PER_PAGE = 30000;


var HELPERS = {
	//"borrowed" from here: https://stackoverflow.com/questions/5448545/how-to-retrieve-get-parameters-from-javascript/
	findGetParameter(parameterName) {
		var result = null,
		tmp = [];
		var items = location.search.substr(1).split("&");
		for (var index = 0; index < items.length; index++) {
			tmp = items[index].split("=");
			if (tmp[0] === parameterName) result = decodeURIComponent(tmp[1]);
		}
		return result;
	}
}

/*
	The purpose of this class is to abstract the "book" UI
*/
class liberator_book_app {

	constructor(targetElementId, bookURL){ 
		this.bookEl = document.getElementById(targetElementId);
		this.bookContentEl = null;	//we will set this in the init
		this.pages = Array();
		this.curPageNum = 0;

		this.lib = new liberator_client("http://68.183.192.73", bookURL);
		this.bookmarker = new liberator_bookmarker(this.lib);

		this.isLoadingPage = false;
	}

	init() {

		this.bookmarker.getSavedBookmarkChar().then( (bookmarkedChar) => {
			this.lib.getBookStylesheet().then( (styles) => {
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
		});
	}

	initInteractive() {
		this.setUpScrollEventHandler();

		var appInstance = this;
		this.bookmarker.initBookmarking(this.bookContentEl, function() { 
			return appInstance.getBookmarkCharOffset(appInstance.pages);
		});
		var curBookmarkOffset = this.bookmarker.getBookmarkOffset();
		this.bookmarker.setBookmarkElementPosition(curBookmarkOffset);
		this.bookEl.scrollTop = curBookmarkOffset;
	}

	getBookmarkCharOffset(pageSparseArray) {
		var charOffset=0;
		for(var i=0; i<pageSparseArray.length; i++) {
			if( pageSparseArray[i]!=true ) {
				charOffset += CHARS_PER_PAGE;
			}
		}
		return charOffset;
	}

	markPageLoaded(pageNum) {
		this.pages[pageNum] = true;
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
			appInstance.markPageLoaded(appInstance.curPageNum);
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
			appInstance.markPageLoaded(appInstance.curPageNum);
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

	constructor(liberatorClient){ 
		this.libClient = liberatorClient;

		this.BOOKMARK_COOKIE_NAME = "curChar";
		this.savedBookmarkChar = undefined;
		this.getSavedBookmarkChar(); //we call this for the side effect

		//these will be initialized in initBookmarking
		this.contentEl = null;
		this.scrollEl = null;
		this.bookmarkEl = null;
		this.bookmarkInterval = null; 
		this.offsetFunction = null;
		
	}

	//this function can be called by consumers to start auto-bookmarking
	// if it's called before getSavedBookmarkChar, it could overwrite initial value
	initBookmarking(contentElement, offsetFunction) {

		this.contentEl = contentElement;
		this.scrollEl = contentElement.parentElement;
		this.bookmarkEl = document.createElement('div');
		this.bookmarkEl.id = "bookmark";
		this.contentEl.appendChild(this.bookmarkEl);
		this.offsetFunction = offsetFunction;

		var bookmarkerInstance = this;
		this.bookmarkInterval = setInterval( function(){ 
			var charOffset = offsetFunction();
			bookmarkerInstance.updateCharCounter(charOffset); 
		}, 5000);
	}

	getSavedBookmarkChar() {

		var theReader = HELPERS.findGetParameter('reader');
		if( this.savedBookmarkChar == undefined && theReader ) {

			return this.libClient.getBookmarkForReader(theReader).then( char => {
				console.log("retrieved bookmark char: "+char);
				this.savedBookmarkChar = char;
				return char;
			});

		} else {
			return new Promise((resolve, reject) => {
				if( this.savedBookmarkChar == undefined ) {
					this.savedBookmarkChar = 0;
					resolve(0);
				} else {
					resolve(this.savedBookmarkChar);
				}
			});
		}
	}

	getBookmarkOffset() {
		//error case in case we don't have a content element
		if(this.contentEl==null) { return -1; }
		var bookmarkedChar = this.savedBookmarkChar;

		var charCount = this.offsetFunction();
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

	updateCharCounter(charOffset) {

		if(charOffset==undefined) {
			charOffset = 0;
		}

		var charIterator = document.createNodeIterator(this.contentEl, NodeFilter.SHOW_ELEMENT);
		var curNode = charIterator.nextNode(); //this gives us the root node
		curNode = charIterator.nextNode(); //this gives us the first child
		
		var bookmarkNode = curNode;
		while(!curNode.offsetTop || (curNode.offsetTop < this.scrollEl.scrollTop) ) {
			curNode = charIterator.nextNode();
			bookmarkNode = curNode;
		}
		//POST: bookmarkNode is where we'd like to bookmark 

		this.setBookmarkElementPosition(bookmarkNode.offsetTop);

		var curParent = bookmarkNode;
		var ancestorList = [];
		while( curParent != this.contentEl ) {
			ancestorList.push(curParent);
			curParent = curParent.parentNode;
		}
		//POST: ancestorList contains ancestors of bookmarkNode

		var charCount = charOffset;
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

		var theReader = HELPERS.findGetParameter('reader');
		if( theReader ) {
			console.log('bookmarking at char: '+charCount);
			this.libClient.setBookmarkForReader(theReader, charCount);
		}
	}

	setBookmarkElementPosition(topPx) {
		this.bookmarkEl.setAttribute('style', 'top:'+topPx+'px');
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

	constructor(apiURL, bookURL){
		this.apiURL = apiURL;
		this.bookRoot = bookURL;
		this.bookURL = this.apiURL+":8080/"+this.bookRoot;
	}

	getCharOfPage(pageNum) {
		return (pageNum) * CHARS_PER_PAGE;
	}

	getPageUrlByChar(char) {
		var charURL = Math.floor(char/CHARS_PER_PAGE) * CHARS_PER_PAGE;
		return this.bookURL+'/xhtml/'+charURL+'.html';
	}

	getPage(pageNum) {
		var charOfPage = this.getCharOfPage(pageNum);

		return fetch(this.bookURL+'/xhtml/'+charOfPage+'.html')
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
		var pageNum = Math.floor(char/CHARS_PER_PAGE);
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

	getBookStylesheet() {
		var cssURL = this.bookURL+'/css/idGeneratedStyles.css'
		return fetch(cssURL)
		.then( resp => resp.text() )
		.then( text => {
			return text;
		}).catch( function(error) {
			console.log(error);
		})
	}

	getBookmarkForReader(reader) {
		return fetch(this.apiURL+"/"+this.bookRoot+'/api/bookmark?reader='+reader)
			.then( resp => resp.json() )
			.then( body => {
				if( body.status=="OK" && body.char ) {
					return body.char;
				} else {
					return 0;
				}
			})
			.catch(function(error) {
				console.log(error)
				throw error;
			});
	}

	setBookmarkForReader(reader, charToBookmark) {
		fetch(this.apiURL+"/"+this.bookRoot+'/api/bookmark?reader='+reader, {
			method: "POST",
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: "char="+charToBookmark,
		})
		.then( resp => resp.json() )
		.catch(function(error) {
			console.log("Error in saving bookmark: "+error);
		});

	}
}