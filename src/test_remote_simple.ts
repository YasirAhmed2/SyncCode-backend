
import axios from 'axios';

async function testRemoteCorsSimple() {
    const url = 'https://api.synccode.dev/auth/register';
    const origin = 'https://www.synccode.dev';

    try {
        const response = await axios({
            method: 'options',
            url: url,
            headers: { 'Origin': origin, 'Access-Control-Request-Method': 'POST' },
            validateStatus: () => true
        });

        console.log(`STATUS: ${response.status}`);
        console.log(`ACAO: ${response.headers['access-control-allow-origin'] || 'MISSING'}`);
        console.log(`ACAM: ${response.headers['access-control-allow-methods'] || 'MISSING'}`);
        console.log(`SERVER: ${response.headers['server'] || 'MISSING'}`);

    } catch (err) {
        console.log('ERROR:', err.message);
    }
}

testRemoteCorsSimple();
