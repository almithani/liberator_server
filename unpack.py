import click
from ebooklib.epub import EpubReader

output_dir = './output/'

@click.command()
@click.argument('file')
def unpack(file):

	reader = EpubReader(file)
	book = reader.load()

	for item in book.get_items():
		if item.get_type() == 9:
			click.echo(item.get_body_content())


"""	
	if zipfile.is_zipfile(file) :
		archive = zipfile.ZipFile(file)
		
		archive.extractall(output_dir)

		archive.close()
	else:
		click.echo('The file does not appear to be a valid epub archive')
"""

if __name__ == '__main__':
	unpack()