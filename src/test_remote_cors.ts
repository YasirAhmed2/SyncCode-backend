
import axios from 'axios';

async function testRemoteCors() {
    const origin = 'https://www.synccode.dev';
    const url = 'https://api.synccode.dev/auth/register';

    console.log(`Testing OPTIONS ${url} with Origin: ${origin}`);

    try {
        const response = await axios({
            method: 'options',
            url: url,
            headers: {
                'Origin': origin,
                'Access-Control-Request-Method': 'POST'
            },
            validateStatus: () => true // Allow any status
        });

        console.log(`Status: ${response.status}`);
        console.log('Headers:', JSON.stringify(response.headers, null, 2));

        if (response.headers['access-control-allow-origin'] === origin) {
            console.log('SUCCESS: Access-Control-Allow-Origin header is present and correct.');
        } else {
            console.log('FAILURE: Access-Control-Allow-Origin header is MISSING or INCORRECT.');
        }

    } catch (error) {
        console.error('Error during request:', error.message);
        if (error.response) {
            console.log('Error Response Headers:', JSON.stringify(error.response.headers, null, 2));
        }
    }
}

testRemoteCors();
