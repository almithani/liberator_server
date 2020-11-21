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
	},

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
	The purpose of this class is to abstract the "book" UX.  Think of it as a top-level
		delegate for any and all "book" functionality
*/
class liberator_book_app {

	constructor(bookElementId, bookURL, headerSelectorsObject){ 
		this.bookEl = document.getElementById(bookElementId);
		this.reader = this.getReader();

		this.lib = new liberator_client("http://books.liberator.me", bookURL);
		this.bookmarker = new liberator_bookmarker(this.lib, this.reader);
		var appInstance = this;
		this.header = new liberator_header(this.lib, headerSelectorsObject, this.reader, function(readerName) {
			appInstance.updateReader(readerName); 
		});
		this.timeline = null; //initialized in init

		/* all of these will be initialized in initUI */
		this.bookContentEl = null;	
		this.pages = null;
		this.curPageNum = 0;
		this.isLoadingPage = false;

		this.initUI();
	}

	getReader() {
		return HELPERS.getCookie('reader');
	}

	updateReader(readerName) {
		if( readerName && readerName.length > 0 ) {
			document.cookie = "reader="+readerName;
			//save bookmark
			this.bookmarker.setReader(readerName);
			var charOffset = this.getBookmarkCharOffset(this.pages);
			this.bookmarker.bookmarkCurrentLocation(charOffset).then( function() {
				//reload the page so we don't have to keep track of complicated state
				window.location.reload(true);
			});
		}
	}

	initUI() {

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

				//set up bookmeta data
				var totalChars = 0;
				this.lib.getBookMeta().then( (_totalChars) => {
					this.pages = Array( Math.ceil(_totalChars/CHARS_PER_PAGE) );
					totalChars = _totalChars;
					return this.lib.getAllBookmarks();
				}).then( (allBookmarks) => {
					this.timeline = new liberator_timeline(this.bookEl, this.reader, totalChars, allBookmarks);
					this.timeline.updateTimelineBookmark(bookmarkedChar);
				});

				var appInstance = this;
				this.loadPageByChar(bookmarkedChar, function(){ appInstance.initInteractive() });
			});
		});
	}

	initInteractive() {
		this.setUpScrollEventHandler();

		var appInstance = this;
		this.bookmarker.startAutoBookmarking(
			this.bookContentEl, 
			function() { 
				return appInstance.getBookmarkCharOffset(appInstance.pages);
			},
			function(newCharCount) {
				appInstance.timeline.updateTimelineBookmark(newCharCount);
			}
		);
		var curBookmarkOffset = this.bookmarker.getBookmarkOffset();
		this.bookEl.scrollTop = curBookmarkOffset;
	}

	getBookmarkCharOffset(pageArray) {
		var charOffset=0;
		/*
			pageArray gets initialized to the # of total pages, and marks loaded pages as TRUE.
				charOffset is meant to track non-loaded pages BEFORE loaded pages, therefore 
				it's the number of pages before the first TRUE value
		*/
		for(var i=0; i<pageArray.length; i++) {
			if( pageArray[i]!=true ) {
				charOffset += CHARS_PER_PAGE;
			} else {
				break;
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

		//don't load if this is the last page
		if( this.isLastPage(this.curPageNum) ) return false;

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

	isLastPage(curPageNum){
		if( curPageNum>=this.pages.length-1 ) return true;
		return false;
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
	The purpose of this class is to manage the "timeline" functionality including UI
		- timeline is a full-book view of bookmarks, etc
*/
class liberator_timeline {
	
	constructor(bookElement,reader,totalBookChars,allBookmarksList) {

		//the number of "#timeline .bookmark.color" classes in the css
		this.NUM_BOOKMARK_COLOURS = 5;

		this.bookEl = bookElement;
		this.totalChars = totalBookChars;
		this.reader = reader;

		delete allBookmarksList[this.reader];
		this.otherBookmarks = allBookmarksList;

		//initialized in init function
		this.timelineEl = null; 
		this.bookmarkEl = null;

		this.initUI();
	}

	initUI() {
		this.timelineEl = document.createElement('div');
		this.timelineEl.id = "timeline";

		//add other bookmarks first
		var bookmarkIndex = 0;
		for (let reader in this.otherBookmarks) {
			var otherBookmarkEl = this.createBookmarkElement(reader, this.otherBookmarks[reader],bookmarkIndex);
			this.timelineEl.append(otherBookmarkEl);
			bookmarkIndex++;
		}

		var curReader = this.reader ? this.reader : "you";
		this.bookmarkEl = this.createBookmarkElement(curReader, 0);
		//set hidden until updateTimelineBookmark is called
		this.bookmarkEl.setAttribute('style', 'display:none');
		this.timelineEl.append(this.bookmarkEl);

		this.bookEl.append(this.timelineEl);
	}

	createBookmarkElement(reader, currentChars, bookmarkIndex) {

		var colourClass = bookmarkIndex % this.NUM_BOOKMARK_COLOURS;

		var bookmarkEl = document.createElement('div');
		bookmarkEl.className = "bookmark color"+colourClass;
		bookmarkEl.setAttribute('style', this.getBookmarkPositionStyle(currentChars));

		var bookmarkLabelEl = document.createElement('div');
		bookmarkLabelEl.className = "label";
		bookmarkLabelEl.innerHTML = reader;
		bookmarkEl.append(bookmarkLabelEl);

		return bookmarkEl;
	}

	getPercentDone(currentChar) {
		return currentChar/this.totalChars*100;
	}

	getBookmarkPositionStyle(currentChar) {
		return 'left:'+this.getPercentDone(currentChar)+'%';
	}

	updateTimelineBookmark(newBookmarkChar) {
		this.bookmarkEl.setAttribute('style', this.getBookmarkPositionStyle(newBookmarkChar));
	}
}


/*
	The purpose of this class is to manage bookmarking.

	PRE: contentElement MUST exist, and must be child to a scrollable parent
*/
class liberator_bookmarker {

	constructor(liberatorClient, reader){ 
		this.libClient = liberatorClient;
		this.reader = reader;

		this.savedBookmarkChar = undefined;
		this.getSavedBookmarkChar(); //we call this for the side effect

		//these will be initialized in startAutoBookmarking
		this.contentEl = null;
		this.scrollEl = null;
		this.bookmarkEl = null;
		this.bookmarkInterval = null; 
		this.offsetFunction = null;
		
	}

	setReader(readerName) {
		this.reader = readerName;
	}

	//this function can be called by consumers to start auto-bookmarking
	// if it's called before getSavedBookmarkChar, it could overwrite initial value
	startAutoBookmarking(contentElement, offsetFunction, updateFunction) {

		this.contentEl = contentElement;
		this.scrollEl = contentElement.parentElement;
		this.bookmarkEl = document.createElement('div');
		this.bookmarkEl.id = "bookmark";
		this.offsetFunction = offsetFunction;
		this.updateFunction = updateFunction;

		var bookmarkerInstance = this;
		this.bookmarkInterval = setInterval( function(){ 
			var charOffset = offsetFunction();
			bookmarkerInstance.bookmarkCurrentLocation(charOffset); 
		}, 5000);
	}

	getSavedBookmarkChar() {

		if( this.savedBookmarkChar == undefined && this.reader ) {

			return this.libClient.getBookmarkForReader(this.reader).then( char => {
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
		var curChild = traversalNode.childNodes[childIterator];
		var prevChild = null;

		while(true) {

			if ( charCount+curChild.textContent.length==bookmarkedChar ) {
				//we have the node!
				break;

			} else if ( charCount+curChild.textContent.length > bookmarkedChar ) {
				//we've gone past the target node, drop traversal down into this node
				childIterator = 0;
				traversalNode = curChild;
				prevChild = curChild;
				curChild = traversalNode.childNodes[childIterator];

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
				prevChild = curChild;
				curChild = traversalNode.childNodes[childIterator];

				if(curChild == undefined) {
					//error case to account for small inaccuracies
					curChild = prevChild;
					break;
				}
				continue;

			}
		}
		//POST: curChild is the node we want to scroll to

		//if the node doesn't have an offset, get offset of prev sibling or parent
		var bookmarkOffset = 0;
		if( curChild.offsetTop ) {
			bookmarkOffset = curChild.offsetTop;
		} else if( curChild.previousElementSibling ) {
			bookmarkOffset = curChild.previousElementSibling.offsetTop;
		} else if( curChild.parentElement ) {
			bookmarkOffset = curChild.parentElement.offsetTop;
		}

		this.addBookmarkElement(bookmarkOffset);
		return bookmarkOffset;

	}

	bookmarkCurrentLocation(charOffset) {

		this.removeBookmarkElement();

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
		var curChild = traversalNode.childNodes[childIterator];
		while(true) {
			if( curChild == bookmarkNode ) {
				//if it's our bookmark node, we're done
				break;
			} else if ( !ancestorList.includes(curChild) ) {
				//if the node is not an ancestor, just include all text and move to next sibling
				charCount += curChild.textContent.length;
				childIterator++;
				curChild = traversalNode.childNodes[childIterator];
				continue;
			} else {
				//if the node is an ancestor, traverse its children
				childIterator = 0;
				traversalNode = curChild;
				curChild = traversalNode.childNodes[childIterator];
				continue;
			}
		}
		//POST: charCount includes all chars before bookmarkNode 

		//update UI
		this.addBookmarkElement(bookmarkNode.offsetTop);
		this.updateFunction(charCount);

		//save data to backend
		if( this.reader ) {
			console.log('bookmarking at char: '+charCount);
			return this.libClient.setBookmarkForReader(this.reader , charCount);
		} else {
			return new Promise((resolve, reject) => {
				resolve(0);
			});
		}
	}

	addBookmarkElement(topPx) {
		this.bookmarkEl.setAttribute('style', 'top:'+topPx+'px');
		this.contentEl.prepend(this.bookmarkEl);
	}

	removeBookmarkElement() {
		try {
			this.contentEl.removeChild(this.bookmarkEl);
		} catch(e) {
			//do nothing
		}
		
	}

}


/*
	The purpose of this class is to handle UI and behaviour of the header
	headerSelectorObject is just a blob of selectors used for UI manipulations
*/
class liberator_header {
	constructor(liberatorApiClient, headerSelectorObject, readerName, updateReaderFunction) {
		
		this.libClient = liberatorApiClient;

		this.$header = $(headerSelectorObject.header);
		this.$headerCta = $(headerSelectorObject.headerCTA);
		this.$lightbox = $(headerSelectorObject.lightbox);
		this.$lightboxBG = $(headerSelectorObject.lightboxBG);
		this.$lightboxX = $(headerSelectorObject.lightboxX);
		this.$signupForm = $(headerSelectorObject.signupForm);
		this.$loginForm = $(headerSelectorObject.loginForm);
		this.$toggle = $(headerSelectorObject.formToggle);
		this.updateReaderFunction = updateReaderFunction;

		this.initUI();

		if( readerName ) this.setReader(readerName);
	}

	initUI() {
		this.$lightbox.css('display', 'none');
		var headerInstance = this;
		
		this.$headerCta.click( function() {
			if( headerInstance.$lightbox.css('display')=='none' ) {
				headerInstance.$lightbox.css('display', 'flex')
			} else {
				headerInstance.$lightbox.css('display', 'none')
			}
		});

		this.$lightboxBG.add(this.$lightboxX).click( function() {
			headerInstance.$lightbox.css('display', 'none');
		});

		this.$signupForm.submit( function(e) {
			e.preventDefault();
			headerInstance.handleSignupSubmit();
		});

		this.$loginForm.submit( function(e) {
			e.preventDefault();
			headerInstance.handleLoginSubmit();
		});

		headerInstance.$signupForm.css("display", "none");
		this.$toggle.click( function(e) {
			e.preventDefault();

			if( headerInstance.$signupForm.css("display")=="none" ){
				headerInstance.$loginForm.css("display", "none");
				headerInstance.$signupForm.css("display", "block");
				return true;
			} 

			headerInstance.$signupForm.css("display", "none");
			headerInstance.$loginForm.css("display", "block");
		});
	}

	handleLoginSubmit() {
		var username = this.$loginForm.find("input[name='username']").val();
		var password = this.$loginForm.find("input[name='password']").val();

		var headerInstance = this;

		this.libClient.login(username,password).then( function(user) {
			if( user ) {
				headerInstance.hideAuthLightbox();
				headerInstance.updateReader(user.username);
			}
		});
	}

	handleSignupSubmit() {
		var username = this.$signupForm.find("input[name='username']").val();
		var email = this.$signupForm.find("input[name='email']").val();
		var password = this.$signupForm.find("input[name='password']").val();

		var headerInstance = this;

		headerInstance.libClient.signup(username,email,password).then( function(user) {
			if( user ) {
				headerInstance.hideAuthLightbox();
				headerInstance.updateReader(user.username);
			}
		});
	}

	setReader(username) {
		this.$headerCta.html(username);
		this.$headerCta.unbind("click").click( function(e) {
			e.preventDefault();
		});
	}

	updateReader(username) {
		this.setReader(username);
		this.updateReaderFunction(username);
	}

	hideAuthLightbox() {
		this.$lightbox.css('display', 'none');
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
				//console.log(error)
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
				//console.log(error)
				throw error;
			});
	}

	getBookStylesheet() {
		var cssURL = this.bookURL+'/css/bookStyles.css'
		return fetch(cssURL)
			.then( resp => resp.text() )
			.then( text => {
				return text;
			}).catch( function(error) {
				console.log(error);
			})
	}

	getBookMeta() {
		return fetch(this.apiURL+"/"+this.bookRoot+"/api/bookmeta")
			.then( resp => resp.json() )
			.then( body => {
				if( body.status=="OK" && body.total_chars ) {
					return body.total_chars;
				} else {
					return 0;
				}
			})
			.catch(function(error) {
				console.log(error)
				//throw error;
			});
	}

	getAllBookmarks() {
		return fetch(this.apiURL+"/"+this.bookRoot+"/api/allBookmarks")
			.then( resp => resp.json() )
			.then( body => {
				if( body.status=="OK" && body.bookmarks ) {
					return body.bookmarks;
				} else {
					return {};
				}
			})
			.catch(function(error) {
				console.log(error)
				//throw error;
			});
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
				//throw error;
			});
	}

	setBookmarkForReader(reader, charToBookmark) {
		return fetch(this.apiURL+"/"+this.bookRoot+'/api/bookmark?reader='+reader, {
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

	login(username, password) {
		return fetch(
			'https://api.liberator.me/users/login/', 
			{
				method: "POST",
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: 'username=' + encodeURI(username) + '&password=' + encodeURI(password),
			}
		).then( resp => {
			return resp.json();
		}).then( json => { 
			console.log(json);
			if( json.status='ok' )
				return json.user;
			
			return false;
		}).catch(function(error) {
			console.log("Error in login: "+error);
		});
	}

	signup(username, email, password) {
		return fetch(
			'https://api.liberator.me/users/', 
			{
				method: "POST",
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: 'email=' + encodeURI(email) + '&username=' + encodeURI(username) + '&password=' + encodeURI(password),
			}
		).then( resp => {
			if( resp.status==201 ) {
				return resp.json();
			} else {
				throw('user not created')
			}

		}).then( json => {
			//the json is just the user
			return json;

		}).catch(function(error) {
			console.log("Error in signup up: "+error);
		});
	}
}

