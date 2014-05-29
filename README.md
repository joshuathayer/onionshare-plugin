# onionshare-plugin

A Firefox plugin which enables restartable downloads via [onionshare](https://github.com/micahflee/onionshare).

## current status

This is still a rough sketch. Some basic functionality exists- the plugin recognizes an onionshare page, enables the download button, downloads and saves chunks of the remaining file. The download may be restarted by refreshing the page: already-downloaded chunks are stored and don't need to be re-downloaded.

When all chunks are downloaded, the file is reconstituted. Text files are working great. Sadly, binary files are corrupt.

Work is needed, too, in communicating download status to the user.
