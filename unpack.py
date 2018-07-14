import click
import ebooklib
from ebooklib.epub import EpubReader
from io import BytesIO
from io import TextIOBase

OUTPUT_DIR = './output/'
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

	#parse the epub contents
	reader = EpubReader(file)
	book = reader.load()

	items = list(book.get_items_of_type(ebooklib.ITEM_DOCUMENT))
	#item = items[1]
	#print(item.get_name())
	#print(item.get_body_content().decode("utf-8"))
	#print("----")		
	#contents_bytestream = BytesIO(item.get_body_content())
	#process_visible_chars(contents_bytestream)	

	for item in items:
		print(item.get_name())	
		contents_bytestream = BytesIO(item.get_body_content())
		process_visible_chars(contents_bytestream)	

	return


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

	print("this file has: %i visible chars" % total_chars_processed)


def get_output_file():

	global current_file_to_write

	if current_file_to_write is None:
		open_new_file()

	return current_file_to_write


def open_new_file():

	global current_file_to_write
	global current_file_number
	global current_file_chars

	filepath = OUTPUT_DIR+'a'+str(current_file_number)+'.html'
	current_file_number += 1
	current_file_to_write = open(filepath, 'wb') 	
	current_file_chars = 0


def get_next_output_file(current_output_file: TextIOBase=None):

	global current_file_to_write

	if current_output_file is not None:
		current_output_file.close()

	open_new_file()

	return current_file_to_write


if __name__ == '__main__':
	unpack()