const path = require('path');
const ContactList = require('./controllers/contact_list_controller');

module.exports = function(app) {
	app.get('/', function(req, res) { res.sendFile(path.join(__dirname, '/static/index.html')) });
	//function(req, res) { res.sendFile(path.join(__dirname, '/static/success.html')) }
	app.get('/validate', ContactList.validateEmail);
	app.post('/confirmEmail', ContactList.sendConfirmation);
}