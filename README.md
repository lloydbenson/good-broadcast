![good Logo](https://raw.github.com/hapijs/good/master/images/good.png)

[![Build Status](https://secure.travis-ci.org/hapijs/good-broadcast.png)](http://travis-ci.org/hapijs/good-broadcast)

Lead Maintainer: [Lloyd Benson](https://github.com/lloydbenson)

### broadcasting logs

`good-broadcast` includes a _'broadcast'_ script that is capable of broadcasting a log file externally via a POST request to the designated server. Below is the command to use to execute _'broadcast'_:

`broadcast -c broadcast.json`

### Config File

A broadcast.json may look like:

```json
{
    "url": "http://analytics.mysite.com",
    "interval": 1000,
    "log": "/fullpath/request_services.log",
    "newOnly": true,
    "resumePath": "/fullpath/temp/logindex.tmp",
    "wait": 1000,
    "attempts": 1,
    "maxEvents": 32,
    "maxSize": 65535
}
```

### Configuration Object

- `url` - (**required**) The complete URL to POST log information.
- `interval` - The frequency to check the log file for changes. Defaults to 1000.
- `log` - (**required**) Path to the log file.
- `newOnly` - Only send new log entries. Defaults to `false`.
- `resumePath` - Maintain a file to keep track of previous reads and start from that index on restarts or failures.
- `wait` - Number of milliseconds to wait before trying a failed broadcast again. Defaults to 1000.
- `attempts` - Number attempts to make before giving up on the current payload. Defaults to 1.
- `maxEvents` - Maximum events per payload. Default to 32.
- `maxSize` - Maximum payload size in bytes. Default to 65535.

### Killing Process
Sending issuing `kill -SIGUSR2 PID`, where PID is the running broadcast script. You can get the PID with the following linux command `ps auxww | grep node`.
