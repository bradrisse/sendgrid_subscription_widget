const sg = require('sendgrid')(process.env.SG_API_KEY);
sg.globalRequest.headers['User-Agent'] = 'subscription-widget/1.0.0';

var hashAuthToken = require('./validate')(process.env.HASH_TOKEN_SECRET);

const path = require('path');
const Settings = require('../../settings');
const optIn = 'opt-in';

function prepareConfirmationEmail(reqBody) {
	const subject = "Please Confirm Your Email Address";
    const accessToken = hashAuthToken.generate({email: reqBody.email, sent: Date.now()}, 3600);
	const url = formatUrl(Settings.url) + '/validate?accessToken='+accessToken;
	const link = "<a href='" + url + "'>this link</a>"
	const mailText = "Thanks for signing up! Click " + link + " to sign up!  This link will be active for 24 hours.";

	var emailBody = {
	  personalizations: [
	    {
	      to: [
	        {
	          email: reqBody.email,
	        }
	      ],
	      subject: subject,
	      custom_args: {
	      	type: optIn,
	      	time_sent: String(Date.now()),
	      },
	      substitutions: {
	      	link_insert: link
	      }
	    },
	  ],
	  from: {
	    email: Settings.senderEmail,
	    name: Settings.senderName,
	  },
	  content: [
	    {
	      type: "text/html",
	      value: mailText,
	    }
	  ]
	}

	const templateId = Settings.templateId;
	if (templateId) emailBody.template_id = templateId;

	for (key in reqBody) {
		emailBody.personalizations[0].custom_args[key] = reqBody[key];
	}

	return emailBody;
}

function prepareNotificationEmail(reqBody) {
	const subject = "New email signup";
	const mailText = "A new person just confirmed they would look to receive your emails via your email subscription widget.<br/><b>Name: </b><br/><b>Email: </b>" + reqBody.email;

	var emailBody = {
	  personalizations: [
	    {
	      to: [
	        {
	          email: Settings.notificationEmail,
	        }
	      ],
	      subject: subject
	    },
	  ],
	  from: {
	    email: Settings.senderEmail,
	    name: Settings.senderName,
	  },
	  content: [
	    {
	      type: "text/html",
	      value: mailText,
	    }
	  ],
	}

	return emailBody;
}

// Send confirmation email to contact with link to confirm email
exports.sendConfirmation = (req, res, next) => {
	var request = sg.emptyRequest({
		method: 'POST',
		path: '/v3/mail/send',
		body: prepareConfirmationEmail(req.body)
	});

	sg.API(request, function(error, response) {
		if (error) {
			console.log('Error response received');
		}

		if (response.statusCode >= 200 && response.statusCode < 300) {
			res.sendFile(path.join(__dirname, '../static/check-inbox.html'));
		} else {
			res.sendFile(path.join(__dirname, '../static/error.html'));
		}
	});
}

exports.validateEmail = function (req, res, next) {

	var accessToken = req.query.accessToken;
	if (accessToken) {
		console.log('accessToken ', accessToken);
        var userObj = hashAuthToken.verify(accessToken);
        if (userObj) {
            addUserToList(userObj, function() {
                //send notification about the new signup
                if (Settings.sendNotification) {
                    console.log("Sending notification");

                    var request = sg.emptyRequest({
                        method: 'POST',
                        path: '/v3/mail/send',
                        body: prepareNotificationEmail(userObj)
                    });

                    sg.API(request, function(error, response) {
                        if (error) {
                            res.sendFile(path.join(__dirname, '../static/error.html'));
                        }
                    });
                }

                res.sendFile(path.join(__dirname, '../static/success.html'));
            });

		} else {
            res.sendFile(path.join(__dirname, '../static/error.html'));
		}
	} else {
        res.sendFile(path.join(__dirname, '../static/error.html'));
	}

}

function addUserToList(emailBody, callback) {
	console.log('addUserToList ', emailBody);

    const timestamp = parseInt(emailBody.validTo);
    const listId = Settings.listId;
    const secondsInDay = 86400;
    const timeElapsed = (Date.now() - timestamp) / 1000;

    // Confirm email type is opt in and link has been clicked within 1 day
    if (timeElapsed < secondsInDay) {
        var request = sg.emptyRequest({
            method: 'POST',
            path: '/v3/contactdb/recipients',
            body: [{email:emailBody.email}]
        });

        sg.API(request, function(error, response) {
        	console.log('response ', response.body);
            if (listId) {
                var contactID = JSON.parse(response.body.toString()).persisted_recipients[0];
                console.log('path ', '/v3/contactdb/lists/' + listId + '/recipients/' + contactID);
                var request = sg.emptyRequest({
                    method: 'POST',
                    path: '/v3/contactdb/lists/' + listId + '/recipients/' + contactID,
                    body: [{email:emailBody.email}]
                });
                sg.API(request, function(error, response) {
                    console.log(response.statusCode)
                    console.log(response.body)
                    console.log(response.headers)

                    callback();
                });
            } else {
                callback();
            }
        });
    } else {
        res.sendFile(path.join(__dirname, '../static/error.html'));
    }

}

function formatUrl(url) {
	if (url.substr(-1) == '/') {
		return url.substring(0, url.length - 1);
	}
	return url;
}
