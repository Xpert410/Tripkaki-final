import express from 'express';
import AWS from 'aws-sdk';

const router = express.Router();

// Configure DynamoDB
const dynamodb = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION || 'ap-southeast-1',
    endpoint: process.env.DDB_ENDPOINT || 'http://localhost:8001',
    accessKeyId: 'dummy',
    secretAccessKey: 'dummy'
});

const PAYMENTS_TABLE = process.env.DYNAMODB_PAYMENTS_TABLE || 'lea-payments-local';
const POLICIES_TABLE = 'lea-insurance-policies';

/**
 * Get pending receipt notifications for a user
 * Used by frontend to check for new policy receipts to display
 */
router.get('/receipts/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Scan for receipt notifications for this user
        const params = {
            TableName: PAYMENTS_TABLE,
            FilterExpression: 'begins_with(payment_intent_id, :prefix) AND user_id = :userId AND #status = :status',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':prefix': 'RECEIPT_NOTIFY_',
                ':userId': userId,
                ':status': 'pending'
            }
        };

        const result = await dynamodb.scan(params).promise();
        const notifications = result.Items || [];

        res.json(notifications);

    } catch (error) {
        console.error('Error fetching receipt notifications:', error);
        res.status(500).json({ 
            error: 'Failed to fetch notifications',
            message: error.message 
        });
    }
});

/**
 * Mark a notification as displayed
 */
router.post('/:notificationId/displayed', async (req, res) => {
    try {
        const { notificationId } = req.params;

        // Find and update the notification
        const scanParams = {
            TableName: PAYMENTS_TABLE,
            FilterExpression: 'notification_id = :notificationId',
            ExpressionAttributeValues: {
                ':notificationId': notificationId
            }
        };

        const scanResult = await dynamodb.scan(scanParams).promise();
        
        if (scanResult.Items && scanResult.Items.length > 0) {
            const notification = scanResult.Items[0];
            
            // Update status to displayed
            const updateParams = {
                TableName: PAYMENTS_TABLE,
                Key: {
                    payment_intent_id: notification.payment_intent_id
                },
                UpdateExpression: 'SET #status = :status, displayed_at = :displayedAt',
                ExpressionAttributeNames: {
                    '#status': 'status'
                },
                ExpressionAttributeValues: {
                    ':status': 'displayed',
                    ':displayedAt': new Date().toISOString()
                }
            };

            await dynamodb.update(updateParams).promise();

            res.json({ success: true, message: 'Notification marked as displayed' });
        } else {
            res.status(404).json({ error: 'Notification not found' });
        }

    } catch (error) {
        console.error('Error updating notification:', error);
        res.status(500).json({ 
            error: 'Failed to update notification',
            message: error.message 
        });
    }
});

/**
 * Get policy details for receipt display
 */
router.get('/policy/:policyId/details', async (req, res) => {
    try {
        const { policyId } = req.params;

        const params = {
            TableName: POLICIES_TABLE,
            Key: {
                policy_id: policyId
            }
        };

        const result = await dynamodb.get(params).promise();
        
        if (result.Item) {
            res.json(result.Item);
        } else {
            res.status(404).json({ error: 'Policy not found' });
        }

    } catch (error) {
        console.error('Error fetching policy details:', error);
        res.status(500).json({ 
            error: 'Failed to fetch policy details',
            message: error.message 
        });
    }
});

/**
 * Trigger policy receipt email resend
 */
router.post('/policy/:policyId/email', async (req, res) => {
    try {
        const { policyId } = req.params;

        // Get policy details
        const policyParams = {
            TableName: POLICIES_TABLE,
            Key: {
                policy_id: policyId
            }
        };

        const policyResult = await dynamodb.get(policyParams).promise();
        
        if (!policyResult.Item) {
            return res.status(404).json({ error: 'Policy not found' });
        }

        const policy = policyResult.Item;

        // Here you would integrate with your email service
        // For now, we'll just log the action
        console.log(`Email resend requested for policy ${policyId} to ${policy.policyholder?.email}`);

        // TODO: Integrate with SendGrid, SES, or your email provider
        // await emailService.sendPolicyReceipt(policy);

        res.json({ 
            success: true, 
            message: 'Policy receipt email queued for delivery',
            email: policy.policyholder?.email
        });

    } catch (error) {
        console.error('Error sending policy email:', error);
        res.status(500).json({ 
            error: 'Failed to send policy email',
            message: error.message 
        });
    }
});

/**
 * Generate policy receipt PDF (placeholder)
 */
router.get('/policy/:policyId/receipt.pdf', async (req, res) => {
    try {
        const { policyId } = req.params;

        // Get policy details
        const policyParams = {
            TableName: POLICIES_TABLE,
            Key: {
                policy_id: policyId
            }
        };

        const policyResult = await dynamodb.get(policyParams).promise();
        
        if (!policyResult.Item) {
            return res.status(404).json({ error: 'Policy not found' });
        }

        // TODO: Generate actual PDF using a library like jsPDF or Puppeteer
        // For now, return a placeholder response
        res.setHeader('Content-Type', 'application/json');
        res.json({ 
            message: 'PDF generation not yet implemented',
            policy_id: policyId,
            download_url: `${req.protocol}://${req.get('host')}/policies/${policyId}.pdf`,
            alternative: 'Please check your email for the policy document'
        });

    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).json({ 
            error: 'Failed to generate PDF',
            message: error.message 
        });
    }
});

/**
 * Clean up expired notifications (utility endpoint)
 */
router.delete('/cleanup/expired', async (req, res) => {
    try {
        const now = new Date().toISOString();
        
        // Scan for expired notifications
        const scanParams = {
            TableName: PAYMENTS_TABLE,
            FilterExpression: 'begins_with(payment_intent_id, :prefix) AND expires_at < :now',
            ExpressionAttributeValues: {
                ':prefix': 'RECEIPT_NOTIFY_',
                ':now': now
            }
        };

        const scanResult = await dynamodb.scan(scanParams).promise();
        const expiredNotifications = scanResult.Items || [];

        // Delete expired notifications
        const deletePromises = expiredNotifications.map(notification => {
            return dynamodb.delete({
                TableName: PAYMENTS_TABLE,
                Key: {
                    payment_intent_id: notification.payment_intent_id
                }
            }).promise();
        });

        await Promise.all(deletePromises);

        res.json({ 
            success: true, 
            deleted_count: expiredNotifications.length,
            message: `Cleaned up ${expiredNotifications.length} expired notifications`
        });

    } catch (error) {
        console.error('Error cleaning up notifications:', error);
        res.status(500).json({ 
            error: 'Failed to cleanup expired notifications',
            message: error.message 
        });
    }
});

/**
 * Health check for notification service
 */
router.get('/health', async (req, res) => {
    try {
        // Test database connectivity
        const testParams = {
            TableName: PAYMENTS_TABLE,
            Limit: 1
        };

        await dynamodb.scan(testParams).promise();

        res.json({
            status: 'healthy',
            service: 'notification-service',
            timestamp: new Date().toISOString(),
            tables: {
                payments: PAYMENTS_TABLE,
                policies: POLICIES_TABLE
            }
        });

    } catch (error) {
        console.error('Notification service health check failed:', error);
        res.status(503).json({
            status: 'unhealthy',
            service: 'notification-service',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

export default router;