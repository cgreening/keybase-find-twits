'use strict';

require('dotenv').config();
let fetch = require('node-fetch');
let cookieFetch = require('fetch-cookie')(fetch);
let FormData = require('form-data');
let scrypt = require('scryptsy')
let _ = require('lodash');
let crypto = require('crypto');

function authenticateWithTwitter(clientKey, clientSecret) {
  let form = new FormData();
  form.append('grant_type', 'client_credentials');

  let authorization = new Buffer(encodeURIComponent(clientKey) + ':' + encodeURIComponent(clientSecret)).toString('base64');

  let headers = {
    Authorization: 'Basic ' + authorization
  }

  return fetch('https://api.twitter.com/oauth2/token', { method: 'post', body: form, headers: headers }).then((response) => {
    if(response.status == 200) {
      return response.json();
    } else {
      throw new Error('Error authenticating client, got ' + response.status);
    }
  }).then((json) => {
    return json.access_token;
  });
}

function downloadTwitterItems(accessToken, endPoint, resultField, screenName) {
  let headers = {
    Authorization: 'Bearer ' + accessToken
  }
  function fetchItems(cursor) {
    return fetch('https://api.twitter.com/1.1/' + endPoint + '.json?cursor=' + cursor + '&screen_name=' + screenName + '&skip_status=true&include_user_entities=false', {headers: headers})
    .then((response) => {
      if(response.status == 200) {
        return response.json();
      } else {
        var error = new Error(response.statusText)
        error.response = response
        throw error
      }
    }).then((json) => {
      let items = [];
      if(resultField) {
        items = json[resultField];
      } else {
        items = json;
      }
      if(json.next_cursor && json.next_cursor != 0) {
        return fetchItems(json.next_cursor).then((moreItems) => {
          return [...items, ...moreItems];
        });
      } else {
        return items;
      }
    });
  }
  return fetchItems(-1);
}

function lookupTwitterIds(accessToken, ids) {
  let headers = {
    Authorization: 'Bearer ' + accessToken
  }
  return Promise.all(
    _(ids).chunk(100).map(
      (subIds) => {
        return fetch('https://api.twitter.com/1.1/users/lookup.json?user_id='+subIds.join(','), {headers: headers}).then((response) => {
          if(response.status == 200) {
            return response.json();
          } else {
            var error = new Error(response.statusText)
            error.response = response
            throw error
          }
        })
      }
    ).values()
  ).then((userChunks) => _.flatten(userChunks));
}

function lookupTwits(csrfToken, twits) {
  return cookieFetch('https://keybase.io/_/api/1.0/user/discover.json?twitter=' + twits.join(',') + '&csrf_token=' + csrfToken + '&usernames_only=1').then((response) => {
    if(response.status == 200) {
      return response.json();
    } else {
      var error = new Error('lookup:' + response.statusText);
      error.response = response
      throw error
    }
  }).then((json) => {
    return json.matches.twitter;
  });
}

function keybaseLogin(username, passphrase) {
  return fetch('https://keybase.io/_/api/1.0/getsalt.json?email_or_username='+username).then((response) => {
    if(response.status == 200) {
      return response.json();
    } else {
      var error = new Error('getsalt: ' + response.statusText);
      error.response = response
      throw error
    }
  }).then((json) => {
    if(json.status.code == 0) {
      let salt = json.salt;
      let loginSession = json.login_session;

      let pwh = scrypt(passphrase, new Buffer(salt, 'hex'), Math.pow(2,15), 8, 1, 224).slice(192);
      let hash = crypto.createHmac('sha512', pwh);
      hash.update(new Buffer(loginSession, 'base64'));
      let hmacPwh = hash.digest().toString('hex');

      let loginBody = JSON.stringify({ email_or_username: username, hmac_pwh: hmacPwh, login_session: loginSession });

      return cookieFetch('https://keybase.io/_/api/1.0/login.json?email_or_username='+username+'&hmac_pwh=' + hmacPwh + '&login_session=' + loginSession, { method: 'post'})
    } else {
      var error = new Error('getsalt:' + JSON.stringify(json.status,2));
      throw error
    }
  }).then((response) => {
    if(response.status == 200) {
      return response.json();
    } else {
      var error = new Error('login:' + response.statusText);
      error.response = response
      throw error
    }
  }).then((json) => {
    if(json.status.code == 0) {
      let csrfToken = json.csrf_token;
      return csrfToken;
    } else {
      var error = new Error('login:' + JSON.stringify(json.status,2));
      throw error
    }
  });
}

authenticateWithTwitter(process.env.TWITTER_KEY, process.env.TWITTER_SECRET).then((accessToken) => {
  return new Promise((resolve) => {
    resolve(Promise.all([downloadTwitterItems(accessToken, 'friends/ids', 'ids', process.env.TWITTER_SCREEN_NAME), downloadTwitterItems(accessToken, 'followers/ids', 'ids', process.env.TWITTER_SCREEN_NAME)]).then((ids) => {
      let following = ids[0];
      let followers = ids[1];
      let notFollowingBack = _(following).difference(followers).values();
      let followingBack = _(followers).intersection(following).values();
      // lookup people we follow and people who follow us back
      return lookupTwitterIds(accessToken, following);
    }).then((followingBackUsers) => {
      let twitterScreenNames = followingBackUsers.map((user) => user.screen_name);
      return keybaseLogin(process.env.KEYBASE_USERNAME, process.env.KEYBASE_PASSPHRASE).then((csrfToken) => {
        return lookupTwits(csrfToken, twitterScreenNames).then((keybaseUsers) => {
          let twitterAndKeybase = _(twitterScreenNames).zip(keybaseUsers).filter((entry) => entry[1].length).fromPairs().value();
          console.log(twitterAndKeybase);
        });
      });
    }, (error) => {
      console.log(error);
      console.log(error.stack);
    }));
  });
}).then(() => {
  console.log('success');
}, (error) => {
  console.log(error);
  console.log(error.stack);
});
