import click
from ebooklib.epub import EpubReader
from io import BytesIO

OUTPUT_DIR = './output/'
VISIBLE_CHARS_PER_FILE = 100000
MARKUP_START_CHAR = b'<'
MARKUP_END_CHAR = b'>'
SPACE_CHAR = b' '


def process_visible_chars(byte_stream: BytesIO):

	current_file_chars = 0
	in_markup_tag = False
	char = byte_stream.read(1)
	while char:

		if char == MARKUP_START_CHAR:
			in_markup_tag = True

		elif char == MARKUP_END_CHAR:
			in_markup_tag = False

		elif char.isspace() and char != SPACE_CHAR:
			#do nothing here
			pass

		else:
			if not in_markup_tag:
				print(char.decode("ISO-8859-1"), end="", flush=True)
				current_file_chars += 1	

		#print(char.decode("utf-8") , end="", flush=True)
		char = byte_stream.read(1)


	print("\nthis file has: %i visible chars" % current_file_chars)


@click.command()
@click.argument('file')
def unpack(file):

	#parse the epub contents
	reader = EpubReader(file)
	book = reader.load()

	items = list(book.get_items())
	item = items[10]

	print(item.get_body_content().decode("utf-8"))
	print("----")

	contents_bytestream = BytesIO(item.get_body_content())
	process_visible_chars(contents_bytestream)
	
	return

"""
	#write new files for contents
	current_file_chars = 0
	for item in book.get_items():
		if item.get_type() == 9:
			contents_bytestream = BytesIO(item.get_body_content())
			for char in contents_bytestream.read(1):
"""
"""	
	if zipfile.is_zipfile(file) :
		archive = zipfile.ZipFile(file)
		
		archive.extractall(OUTPUT_DIR)

		archive.close()
	else:
		click.echo('The file does not appear to be a valid epub archive')
"""

if __name__ == '__main__':
	unpack()