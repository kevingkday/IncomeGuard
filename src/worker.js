/**
 * IncomeGuard Worker — Routes API requests and serves static assets.
 * 
 * POST /api/send-email  →  Sends PDF via SendGrid
 * Everything else       →  Static assets (index.html, etc.)
 */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // ── API: Send Email ──
        if (url.pathname === '/api/send-email') {
            if (request.method === 'OPTIONS') return handleCORS();
            if (request.method === 'POST') return handleSendEmail(request, env);
            return new Response('Method not allowed', { status: 405 });
        }

        // ── Everything else: static assets ──
        return env.ASSETS.fetch(request);
    }
};


// ═══════════════════════════════════════
// CORS
// ═══════════════════════════════════════

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

function handleCORS() {
    return new Response(null, { status: 204, headers: corsHeaders });
}


// ═══════════════════════════════════════
// SendGrid Email Handler
// ═══════════════════════════════════════

async function handleSendEmail(request, env) {

    // Validate API key is configured
    if (!env.SENDGRID_API_KEY) {
        return Response.json(
            { success: false, error: 'SendGrid API key is not configured.' },
            { status: 500, headers: corsHeaders }
        );
    }

    try {
        const body = await request.json();
        const { to, subject, htmlBody, textBody, pdfBase64, pdfFilename } = body;

        // Validate required fields
        if (!to || !subject || !pdfBase64) {
            return Response.json(
                { success: false, error: 'Missing required fields: to, subject, pdfBase64' },
                { status: 400, headers: corsHeaders }
            );
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(to)) {
            return Response.json(
                { success: false, error: 'Invalid recipient email address.' },
                { status: 400, headers: corsHeaders }
            );
        }

        // Build SendGrid payload
        const fromEmail = env.SENDGRID_FROM_EMAIL || 'kevin@oceanfalls.com';
        const fromName = env.SENDGRID_FROM_NAME || 'TCIM IncomeGuard';

        const sgPayload = {
            personalizations: [{ to: [{ email: to }], subject }],
            from: { email: fromEmail, name: fromName },
            content: [
                {
                    type: 'text/plain',
                    value: textBody || 'Please see the attached IncomeGuard quote.',
                },
                {
                    type: 'text/html',
                    value: htmlBody || `<p>${(textBody || 'Please see the attached IncomeGuard quote.').replace(/\n/g, '<br>')}</p>`,
                },
            ],
            attachments: [
                {
                    content: pdfBase64,
                    filename: pdfFilename || 'IncomeGuard_Quote.pdf',
                    type: 'application/pdf',
                    disposition: 'attachment',
                },
            ],
        };

        // Send via SendGrid v3 API
        const sgResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(sgPayload),
        });

        if (sgResponse.status === 202 || sgResponse.status === 200) {
            return Response.json(
                { success: true, message: 'Email sent successfully.' },
                { status: 200, headers: corsHeaders }
            );
        }

        // SendGrid error
        let errorDetail = '';
        try {
            const errBody = await sgResponse.json();
            errorDetail = JSON.stringify(errBody.errors || errBody);
        } catch {
            errorDetail = await sgResponse.text();
        }
        console.error(`SendGrid error [${sgResponse.status}]:`, errorDetail);

        return Response.json(
            { success: false, error: `SendGrid returned ${sgResponse.status}: ${errorDetail}` },
            { status: 502, headers: corsHeaders }
        );

    } catch (err) {
        console.error('send-email error:', err);
        return Response.json(
            { success: false, error: err.message || 'Internal server error.' },
            { status: 500, headers: corsHeaders }
        );
    }
}
