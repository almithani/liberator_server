import click
import json
import ebooklib
import re
import os
from ebooklib.epub import EpubReader
from io import BytesIO
from io import TextIOBase
from pprint import pprint

OUTPUT_PATH = './output/'
XHTML_PATH = 'xhtml/'
IMAGE_PATH = 'image/'
CSS_PATH = 'css/'
CSS_SHARED_OUTPUT_FILENAME = "bookStyles.css"
BOOK_META_FILENAME = "book.meta"
BOOK_HTML_SELECTOR = "#book"

VISIBLE_CHARS_PER_FILE = 30000
MARKUP_START_CHAR = b'<'
MARKUP_END_CHAR = b'>'
TAB_CHAR = b'	'

# the stateful params below are used for continuity between bytestreams
current_file_to_write = None
current_file_number = 0
current_file_chars = 0
total_chars_processed = 0
book_index_dict = {}


@click.command()
@click.argument('file')
def unpack(file):

	#parse the epub contents
	reader = EpubReader(file)
	book = reader.load()
	book_title = book.get_metadata('DC', 'title')[0][0]

	#create output directories needed
	book_output_path = OUTPUT_PATH+get_valid_filename(book_title)+'/'
	create_if_not_exists_output_dir(book_output_path+XHTML_PATH)
	print('Extracting to: '+book_output_path)

	items = list(book.get_items())
	for item in items:
		print('processing file: '+item.get_name())

		if item.get_type()==ebooklib.ITEM_DOCUMENT:
			contents = 	strip_unwanted_tags(item.get_body_content())
			contents_bytestream = BytesIO(contents)
			process_visible_chars(contents_bytestream, book_output_path)	

		elif item.get_type()==ebooklib.ITEM_IMAGE or item.get_type()==ebooklib.ITEM_COVER or item.get_type()==ebooklib.ITEM_FONT:
			#normal case: books are in different directory than xhtml docs, then keep them in the same path
			#special case: images are in the same directory as xhtml, then put them in IMAGE_PATH
			#TODO: this check doesn't ACTUALLY check for the above condition, so it's pretty breakable...
			if len(os.path.dirname(item.get_name()).strip()) < 1:
				save_file_to_output_dir( book_output_path+IMAGE_PATH+'/', os.path.basename(item.get_name()), item.get_content() )
			else:
				#if we have an OEBPS format, strip the OEBPS
				OEPBS_index = os.path.dirname(item.get_name()).strip().find('OEBPS/')
				if OEPBS_index > -1:
					rel_path = IMAGE_PATH+os.path.dirname(item.get_name()).replace('OEBPS/', '')
					save_file_to_output_dir( book_output_path+rel_path+'/', os.path.basename(item.get_name()), item.get_content() )
				else:
					save_file_to_output_dir( book_output_path+os.path.dirname(item.get_name())+'/', os.path.basename(item.get_name()), item.get_content() )

		elif item.get_type()==ebooklib.ITEM_STYLE:
			style_content = descope_css(item.get_content())
			append_content_to_shared_output_file(book_output_path+CSS_PATH, CSS_SHARED_OUTPUT_FILENAME, style_content)

		else: 
			#print(item.get_type())
			pass

	write_book_meta(book_output_path)
	return


def write_book_meta(output_path:str):
	global BOOK_META_FILENAME
	global total_chars_processed 
	global book_index_dict

	output = {}
	output["total_chars"] = total_chars_processed
	output["index"] = book_index_dict

	file = open(output_path+BOOK_META_FILENAME, 'w')
	file.write(json.dumps(output))
	file.close()
	#print(book_index_dict)


def save_file_to_output_dir(output_path:str, filename:str, content: BytesIO):
	create_if_not_exists_output_dir(output_path)
	file = open(output_path+filename, 'wb') 
	file.write(content)
	file.close()


def append_content_to_shared_output_file(output_path:str, filename:str, content: bytes):
	create_if_not_exists_output_dir(output_path)
	file = open(output_path+filename, 'ab')
	file.write(content)
	file.close() 


def descope_css(css_content: BytesIO):
	css_content = css_content.decode("utf-8")

	# first handle beginning of selector blocks
	# ([^;\{\}\n]+) is a capture 1+ char word(s)s that are NOT ; { } or \n
	# \{[\s\S]*?\} matches the actual css rules in {}
	#	\s\S are needed for newlines (can't use DOTALL because we need newlines for the first rule)
	#	*? are non-greedy to ensure we aren't capturing "nested" rules
	#pattern = re.compile("\n*([^;\{\}]+)+\{[\s\S]*?\}")
	pattern = re.compile("([^;\{\}\n]+)\{[\s\S]*?\}")
	rules_to_scope = pattern.finditer(css_content)

	for rule in rules_to_scope:
		old_css_selector = rule.group(1)
		new_css_selector = BOOK_HTML_SELECTOR+" "+old_css_selector
		old_css_rule = rule.group()
		new_css_rule = re.sub(re.escape(old_css_selector), new_css_selector, old_css_rule)
		css_content = re.sub(re.escape(old_css_rule), new_css_rule, css_content)

	#then handle all multi-selctor blocks
	css_content = re.sub(',', ', '+BOOK_HTML_SELECTOR, css_content)

	return str.encode(css_content)


def strip_unwanted_tags(body_content: BytesIO):

	body_content = body_content.decode("utf-8")
	body_content = re.sub(r'</body>', '', body_content)
	body_content = re.sub(r'<body.*>', '', body_content)
	body_content = re.sub(r'&#13;', '', body_content)
	#body_content = re.sub(r'\t', '', body_content)
	#body_content = re.sub(r'\n', '', body_content)
	return str.encode(body_content)


# write the bytestream to the filesystem
# using our chunking rules
def process_visible_chars(byte_stream: BytesIO, book_output_path: str):

	global VISIBLE_CHARS_PER_FILE
	global MARKUP_START_CHAR
	global MARKUP_END_CHAR
	global TAB_CHAR
	
	# these all have to be global to persist between calls to this function
	global current_file_chars 
	global total_chars_processed
	global book_index_dict

	output_file = get_output_file(book_output_path)
	total_file_chars_processed = 0

	# we assume that each bytestream is valid HTML so these don't need to persist between bystreams
	markup_tag_active = False
	markup_tag_name = None
	markup_heading_active = False
	markup_heading_contents = ""
	markup_heading_charindex = 0

	char = byte_stream.read(1)
	while char:

		#don't include tabs, they make the browser add more "fixup" markup
		#if char == TAB_CHAR:
		#	char = byte_stream.read(1)
		#	continue

		output_file.write(char)

		# determine whether or not we're in markup tags
		if char == MARKUP_START_CHAR:
			markup_tag_active = True
			markup_tag_name = ""

		elif char == MARKUP_END_CHAR:
			markup_tag_active = False

			#heading tags have special handling so we can hold them in our index
			match = re.match("(h1|h2|h3|h4|h5|h6)", markup_tag_name, re.IGNORECASE)
			if match:
				markup_heading_active = True
				markup_heading_contents = ""
				markup_heading_charindex = total_chars_processed + total_file_chars_processed

			#this allows us to get the "name" of the header
			match = re.match("(/h1|/h2|/h3|/h4|/h5|/h6)", markup_tag_name, re.IGNORECASE)
			if match:
				#-3 because we don't want the trailing close tag contents
				book_index_dict[markup_heading_charindex] = markup_heading_contents
				markup_heading_active = False

			#some ebooks use this data type to seaprate chapters (instead of headers)
			match = re.search(r"epub:type=\"(.*?)\"", markup_tag_name, re.IGNORECASE)
			if match:
				charindex = total_chars_processed + total_file_chars_processed
				book_index_dict[charindex] = "epub-"+match.group(1)


		if char == MARKUP_START_CHAR or char == MARKUP_END_CHAR:
			#restart the loop with the next char
			char = byte_stream.read(1)
			continue

		if markup_heading_active and not markup_tag_active:
			markup_heading_contents += char.decode("ISO-8859-1")

		if markup_tag_active:
			markup_tag_name += char.decode("ISO-8859-1")
		else:
			#if it's not markup, then count it towards our "visible chars" totals
			#print(char.decode("ISO-8859-1"), end="", flush=True)
			current_file_chars += 1	
			total_file_chars_processed += 1

		#if the file is maxed out, open a new one
		if current_file_chars >= VISIBLE_CHARS_PER_FILE:
			output_file = get_next_output_file(book_output_path, output_file )
			current_file_chars = 0

		char = byte_stream.read(1)

	#keep tally of the # of chars processed
	#print("this file has: %i visible chars" % total_file_chars_processed)
	total_chars_processed = total_chars_processed + total_file_chars_processed
	return


def get_output_file(path: str):

	global current_file_to_write

	if current_file_to_write is None:
		open_new_file(path)

	return current_file_to_write


def open_new_file(path: str):

	global current_file_to_write
	global current_file_number
	global current_file_chars

	filename = str(VISIBLE_CHARS_PER_FILE*current_file_number)
	filepath = path+XHTML_PATH+str(filename)+'.html'
	current_file_number += 1
	current_file_to_write = open(filepath, 'wb') 	
	current_file_chars = 0


def get_next_output_file(book_output_path:str, current_output_file:TextIOBase=None):

	global current_file_to_write

	if current_output_file is not None:
		current_output_file.close()

	open_new_file(book_output_path)

	return current_file_to_write


def create_if_not_exists_output_dir(output_dir: str):
	if not os.path.exists(output_dir):
		os.makedirs(output_dir)

#i "borrowed" this from Django: https://github.com/django/django/blob/master/django/utils/text.py
def get_valid_filename(s):
	"""
	Return the given string converted to a string that can be used for a clean
	filename. Remove leading and trailing spaces; convert other spaces to
	underscores; and remove anything that is not an alphanumeric, dash,
	underscore, or dot.
	>>> get_valid_filename("john's portrait in 2004.jpg")
	'johns_portrait_in_2004.jpg'
	"""
	s = str(s).strip().replace(' ', '_')
	return re.sub(r'(?u)[^-\w.]', '', s)

def get_valid_configvalue(s):
	s = str(s).strip()
	return re.sub(r'(?u)[^-\w.]', '', s)


if __name__ == '__main__':
	unpack()