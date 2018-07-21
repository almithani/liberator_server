import click
import ebooklib
import re
import os
from ebooklib.epub import EpubReader
from io import BytesIO
from io import TextIOBase

OUTPUT_PATH = './output/'
XHTML_PATH = 'xhtml/'
IMAGE_PATH = 'image/'
CSS_PATH = 'css/'

VISIBLE_CHARS_PER_FILE = 30000
MARKUP_START_CHAR = b'<'
MARKUP_END_CHAR = b'>'
SPACE_CHAR = b' '
TAB_CHAR = b'	'

# the stateful params below are used for continuity between bytestreams
current_file_to_write = None
current_file_number = 0
current_file_chars = 0

@click.command()
@click.argument('file')
def unpack(file):

	create_if_not_exists_output_dir(OUTPUT_PATH+XHTML_PATH)

	#parse the epub contents
	reader = EpubReader(file)
	book = reader.load()

	items = list(book.get_items())
	#item = items[1]
	#print(item.get_name())
	#print(item.get_body_content().decode("utf-8"))
	#print("----")	
	#print(strip_body_tags( item.get_body_content() ).decode("utf-8") )
	#contents_bytestream = BytesIO(item.get_body_content())
	#process_visible_chars(contents_bytestream)	

	for item in items:
		print('name: '+item.get_name())

		if item.get_type()==ebooklib.ITEM_DOCUMENT:
			contents = 	strip_body_tags(item.get_body_content())
			contents_bytestream = BytesIO(contents)
			process_visible_chars(contents_bytestream)	

		elif item.get_type()==ebooklib.ITEM_IMAGE or item.get_type()==ebooklib.ITEM_COVER:
			save_file_to_output_dir( OUTPUT_PATH+IMAGE_PATH, os.path.basename(item.get_name()), item.get_content() )

		elif item.get_type()==ebooklib.ITEM_STYLE:
			save_file_to_output_dir( OUTPUT_PATH+CSS_PATH, os.path.basename(item.get_name()), item.get_content() )

		else: 
			print(item.get_type())

	return


def save_file_to_output_dir(output_path:str, filename:str, content: BytesIO):
	create_if_not_exists_output_dir(output_path)
	file = open(output_path+filename, 'wb') 
	file.write(content)
	file.close()


def strip_body_tags(body_content: BytesIO):

	body_content = body_content.decode("utf-8")
	body_content = re.sub(r'</body>', '', body_content)
	body_content = re.sub(r'<body.*>', '', body_content)
	return str.encode(body_content)



# write the bytestream to the filesystem
# using our chunking rules
def process_visible_chars(byte_stream: BytesIO):

	global VISIBLE_CHARS_PER_FILE
	global MARKUP_START_CHAR
	global MARKUP_END_CHAR
	global SPACE_CHAR
	global TAB_CHAR
	global current_file_chars 

	output_file = get_output_file()
	total_chars_processed = 0

	in_markup_tag = False
	char = byte_stream.read(1)
	while char:

		# determine whether or not we're in markup tags
		if char == MARKUP_START_CHAR:
			in_markup_tag = True
		elif char == MARKUP_END_CHAR:
			in_markup_tag = False

		#write to file and adjust our counters
		if char != TAB_CHAR:
			output_file.write(char)

		if not in_markup_tag:
			#print(char.decode("ISO-8859-1"), end="", flush=True)
			current_file_chars += 1	
			total_chars_processed += 1

		#if the file is maxed out, open a new one
		if current_file_chars >= VISIBLE_CHARS_PER_FILE:
			output_file = get_next_output_file(output_file)
			current_file_chars = 0

		char = byte_stream.read(1)

	#print("this file has: %i visible chars" % total_chars_processed)
	return


def get_output_file():

	global current_file_to_write

	if current_file_to_write is None:
		open_new_file()

	return current_file_to_write


def open_new_file():

	global current_file_to_write
	global current_file_number
	global current_file_chars

	filename = str(VISIBLE_CHARS_PER_FILE*current_file_number)
	filepath = OUTPUT_PATH+XHTML_PATH+str(filename)+'.html'
	current_file_number += 1
	current_file_to_write = open(filepath, 'wb') 	
	current_file_chars = 0


def get_next_output_file(current_output_file: TextIOBase=None):

	global current_file_to_write

	if current_output_file is not None:
		current_output_file.close()

	open_new_file()

	return current_file_to_write


def create_if_not_exists_output_dir(output_dir: str):
	if not os.path.exists(output_dir):
		os.makedirs(output_dir)


if __name__ == '__main__':
	unpack()