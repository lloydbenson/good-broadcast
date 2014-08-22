![good Logo](https://raw.github.com/hapijs/good/master/images/good.png)

[**hapi**](https://github.com/hapijs/hapi) process monitoring

[![Build Status](https://secure.travis-ci.org/hapijs/good-broadcast.png)](http://travis-ci.org/hapijs/good-broadcast)

### broadcasting logs

good-broadcast includes a _'broadcast'_ script that is capable of broadcasting to subscriber externally from a log file.  Below is the command to use to execute _'broadcast'_:

`broadcast -c broadcast.json`

where broadcast.json may look like:

```json
{
    "url": "http://analytics.mysite.com",
    "path": "/fullpath/request_services.log",
    "interval": 1000,
    "useLastIndex": false,
    "onlySendNew": true
}
```
