# keybase_find_twits
Looks up people your followers/following from twitter and finds them in keybase.

You'll need a twitter app with a client key and client secret.

## Configuration

Add a `.env` file with the following contents:

```
TWITTER_KEY=[twitter app key]
TWITTER_SECRET=[twitter app secret]
TWITTER_SCREEN_NAME=[twitter screen name - e.g. mrbananas]
KEYBASE_USERNAME=[keybase username - e.g. cgreening]
KEYBASE_PASSPHRASE=[keybase passphrase]
```

# Running

```
git clone https://github.com/cgreening/keybase_find_twits.git
cd keybase_find_twits
npm install
# setup env file or set env variables
node index
```

# Known issues

* Running the code in quick succession seems to generate login errors from keybase
