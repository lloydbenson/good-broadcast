![good Logo](https://raw.github.com/hapijs/good/master/images/good.png)

[**hapi**](https://github.com/hapijs/hapi) process monitoring

[![Build Status](https://secure.travis-ci.org/hapijs/good-broadcast.png)](http://travis-ci.org/hapijs/good-broadcast)

Lead Maintainer: [LLoyd Benson](https://github.com/lloydbenson)

### broadcasting logs

`good-broadcast` includes a _'broadcast'_ script that is capable of broadcasting a log file externally via a POST request to the designated server. Below is the command to use to execute _'broadcast'_:

`broadcast -c broadcast.json`

`broadcast` can be pass either a configuration file or traditional command line arguments. A configuration file will trump any command line arguments.

### Config File

A broadcast.json may look like:

```json
{
    "url": "http://analytics.mysite.com",
    "path": "/fullpath/request_services.log",
    "interval": 1000,
    "useLastIndex": false,
    "lastIndexPath": "/fullpath/temp/logindex.tmp"
    "onlySendNew": true,
    "resume": false
}
```

### Command Line

`good-broadcast` supports the following command line options
- `-u`,`--url` - full URL to the external server to transmit good logs.
- `-l`, `--path` - location of a [good](https://github.com/hapijs/good) log file.
- `-i`, `--interval` - sampling frequency of the log file.
- `-n`, `--onlySendNew` - sets the "start reading" index to the end of the file when the command is started. Then only new events will be transmitted.
- `-p`, `--useLastIndex` - during log file processing a ".lastindex" file is created to keep track of the previous transmission. If the process is restarted, transmission will resume from the location indicated in the ".lastIndex" file. `-p` trumps `-n` and should not be used together.
- `-l`, `--lastIndexPath` - specify a custom file for the `-p` option. Implies `-p`. **WARNING** any file currently at that location will be truncated.

### Killing Process
Sending issuing `kill -SIGUSR2 PID`, where PID is the running broadcast script. You can get the PID with the following linux command `ps auxww | grep node`.