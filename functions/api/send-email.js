/**
 * Cloudflare Pages Function: POST /api/send-email
 * 
 * Receives quote data + PDF (base64), sends via SendGrid
 * with the PDF attached to the recipient broker.
 * 
 * Required secret (set via `wrangler secret put SENDGRID_API_KEY`):
 *   - SENDGRID_API_KEY
 * 
 * Optional env var:
 *   - SENDGRID_FROM_EMAIL  (defaults to info@tcim.ca)
 *   - SENDGRID_FROM_NAME   (defaults to TCIM IncomeGuard)
 */

export async function onRequestPost(context) {
    const { request, env } = context;

    // ── CORS preflight (shouldn't hit POST, but safety) ──
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    // ── Validate API key is configured ──
    if (!env.SENDGRID_API_KEY) {
        return Response.json(
            { success: false, error: 'SendGrid API key is not configured. Run: wrangler secret put SENDGRID_API_KEY' },
            { status: 500, headers: corsHeaders }
        );
    }

    try {
        const body = await request.json();

        // ── Validate required fields ──
        const { to, subject, htmlBody, textBody, pdfBase64, pdfFilename } = body;

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

        // ── Build SendGrid payload ──
        const fromEmail = env.SENDGRID_FROM_EMAIL || 'kevin@oceanfalls.com';
        const fromName = env.SENDGRID_FROM_NAME || 'TCIM IncomeGuard';

        const sgPayload = {
            personalizations: [
                {
                    to: [{ email: to }],
                    subject: subject,
                },
            ],
            from: {
                email: fromEmail,
                name: fromName,
            },
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

        // ── Send via SendGrid v3 API ──
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
        console.error('send-email function error:', err);
        return Response.json(
            { success: false, error: err.message || 'Internal server error.' },
            { status: 500, headers: corsHeaders }
        );
    }
}

/** Handle CORS preflight */
export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}
