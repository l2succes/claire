import { Router } from 'express';
import { whatsappService } from '../services/whatsapp';

const router = Router();

// Serve a simple HTML page with the QR code
router.get('/login/:userId', async (req, res) => {
  const { userId } = req.params;
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Claire - WhatsApp Login</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
          background: white;
          border-radius: 20px;
          padding: 40px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          text-align: center;
          max-width: 400px;
        }
        h1 {
          color: #333;
          margin-bottom: 10px;
        }
        .subtitle {
          color: #666;
          margin-bottom: 30px;
        }
        #qrcode {
          width: 280px;
          height: 280px;
          margin: 20px auto;
          border: 2px solid #f0f0f0;
          border-radius: 12px;
          padding: 10px;
          background: white;
        }
        #qrcode canvas, #qrcode img {
          width: 100% !important;
          height: 100% !important;
        }
        .status {
          margin-top: 20px;
          padding: 12px;
          border-radius: 8px;
          font-weight: 500;
        }
        .status.waiting {
          background: #fef3c7;
          color: #92400e;
        }
        .status.success {
          background: #d1fae5;
          color: #065f46;
        }
        .status.error {
          background: #fee2e2;
          color: #991b1b;
        }
        .instructions {
          margin-top: 20px;
          padding: 20px;
          background: #f9fafb;
          border-radius: 8px;
          text-align: left;
        }
        .instructions h3 {
          margin-top: 0;
          color: #374151;
        }
        .instructions ol {
          color: #6b7280;
          padding-left: 20px;
        }
        .instructions li {
          margin: 8px 0;
        }
        .spinner {
          border: 3px solid #f3f3f3;
          border-top: 3px solid #667eea;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
          margin: 20px auto;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Claire</h1>
        <p class="subtitle">Connect your WhatsApp</p>
        
        <div id="qrcode">
          <div class="spinner"></div>
        </div>
        
        <div id="status" class="status waiting">
          Loading QR Code...
        </div>
        
        <div class="instructions">
          <h3>How to connect:</h3>
          <ol>
            <li>Open WhatsApp on your phone</li>
            <li>Go to Settings → Linked Devices</li>
            <li>Tap "Link a Device"</li>
            <li>Scan this QR code</li>
          </ol>
        </div>
      </div>
      
      <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
      <script>
        const userId = '${userId}';
        let pollInterval;
        
        async function getQRCode() {
          try {
            const response = await fetch(\`/api/auth/qr/\${userId}\`);
            const data = await response.json();
            
            if (data.qr) {
              // Display QR code
              const qrContainer = document.getElementById('qrcode');
              qrContainer.innerHTML = '';
              
              const canvas = document.createElement('canvas');
              qrContainer.appendChild(canvas);
              
              QRCode.toCanvas(canvas, data.qr, {
                width: 280,
                margin: 2,
                color: {
                  dark: '#000000',
                  light: '#FFFFFF'
                }
              });
              
              document.getElementById('status').className = 'status waiting';
              document.getElementById('status').textContent = 'Waiting for QR scan...';
              
              // Start polling for connection status
              pollStatus();
            } else if (data.status === 'connected') {
              onConnected();
            }
          } catch (error) {
            console.error('Failed to get QR code:', error);
            document.getElementById('status').className = 'status error';
            document.getElementById('status').textContent = 'Failed to load QR code';
          }
        }
        
        async function pollStatus() {
          pollInterval = setInterval(async () => {
            try {
              const response = await fetch(\`/api/auth/status/\${userId}\`);
              const data = await response.json();
              
              if (data.status === 'connected') {
                clearInterval(pollInterval);
                onConnected();
              } else if (data.status === 'qr_expired') {
                clearInterval(pollInterval);
                getQRCode(); // Get new QR code
              }
            } catch (error) {
              console.error('Failed to check status:', error);
            }
          }, 2000);
        }
        
        function onConnected() {
          const qrContainer = document.getElementById('qrcode');
          qrContainer.innerHTML = '<div style="font-size: 72px;">✅</div>';
          
          document.getElementById('status').className = 'status success';
          document.getElementById('status').textContent = 'Connected! You can now close this page and return to the Claire app.';
          
          // Notify the app
          if (window.opener) {
            window.opener.postMessage({ type: 'whatsapp_connected' }, '*');
          }
        }
        
        // Start loading QR code
        getQRCode();
        
        // Clean up on page close
        window.addEventListener('beforeunload', () => {
          if (pollInterval) clearInterval(pollInterval);
        });
      </script>
    </body>
    </html>
  `);
});

export default router;