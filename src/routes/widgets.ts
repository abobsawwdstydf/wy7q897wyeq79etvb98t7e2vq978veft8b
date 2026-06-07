import { Router } from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// ─── WIDGETS ────────────────────────────────────────────────────────────

// Get public widgets
router.get('/widgets', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { type, limit = '50' } = req.query;
    const where: any = { isPublic: true };
    if (type) where.type = type;

    const widgets = await prisma.widget.findMany({
      where,
      orderBy: { installCount: 'desc' },
      take: Math.min(Number(limit), 100),
    });
    res.json(widgets);
  } catch (error) {
    console.error('Get widgets error:', error);
    res.status(500).json({ error: 'Failed to get widgets' });
  }
});

// Get user's installed widgets
router.get('/widgets/installed', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const installations = await prisma.widgetInstallation.findMany({
      where: { userId, isActive: true },
      include: { widget: true },
      orderBy: { installedAt: 'desc' },
    });
    res.json(installations);
  } catch (error) {
    console.error('Get installed widgets error:', error);
    res.status(500).json({ error: 'Failed to get installed widgets' });
  }
});

// Install a widget
router.post('/widgets/:widgetId/install', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { widgetId } = req.params;
    const { chatId, config } = req.body;

    const widget = await prisma.widget.findUnique({ where: { id: widgetId } });
    if (!widget) return res.status(404).json({ error: 'Widget not found' });

    if (widget.isPremium) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { isPremium: true } });
      if (!user?.isPremium) return res.status(403).json({ error: 'Premium required' });
    }

    const existing = await prisma.widgetInstallation.findUnique({
      where: { widgetId_userId: { widgetId, userId } },
    });
    if (existing) return res.status(400).json({ error: 'Already installed' });

    const installation = await prisma.$transaction([
      prisma.widget.update({ where: { id: widgetId }, data: { installCount: { increment: 1 } } }),
      prisma.widgetInstallation.create({
        data: { widgetId, userId, chatId, config: config || '{}' },
      }),
    ]);

    res.json(installation[1]);
  } catch (error) {
    console.error('Install widget error:', error);
    res.status(500).json({ error: 'Failed to install widget' });
  }
});

// Uninstall a widget
router.delete('/widgets/:widgetId/uninstall', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { widgetId } = req.params;

    await prisma.widgetInstallation.deleteMany({ where: { widgetId, userId } });
    await prisma.widget.update({ where: { id: widgetId }, data: { installCount: { decrement: 1 } } }).catch(() => {});

    res.json({ success: true });
  } catch (error) {
    console.error('Uninstall widget error:', error);
    res.status(500).json({ error: 'Failed to uninstall widget' });
  }
});

// Create widget (admin/creator)
router.post('/widgets', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const creatorId = req.userId!;
    const { name, description, type, config, dataUrl, iconUrl, isPublic, isPremium } = req.body;

    if (!name || !type) return res.status(400).json({ error: 'name and type required' });

    const widget = await prisma.widget.create({
      data: { creatorId, name, description, type, config: config || '{}', dataUrl, iconUrl, isPublic: isPublic !== false, isPremium: isPremium || false },
    });
    res.json(widget);
  } catch (error) {
    console.error('Create widget error:', error);
    res.status(500).json({ error: 'Failed to create widget' });
  }
});

// ─── PLUGINS ────────────────────────────────────────────────────────────

// Get public plugins
router.get('/plugins', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { type, limit = '50' } = req.query;
    const where: any = { isPublic: true };
    if (type) where.type = type;

    const plugins = await prisma.plugin.findMany({
      where,
      orderBy: { installCount: 'desc' },
      take: Math.min(Number(limit), 100),
    });
    res.json(plugins);
  } catch (error) {
    console.error('Get plugins error:', error);
    res.status(500).json({ error: 'Failed to get plugins' });
  }
});

// Get user's installed plugins
router.get('/plugins/installed', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const installations = await prisma.pluginInstallation.findMany({
      where: { userId, isActive: true },
      include: { plugin: true },
    });
    res.json(installations);
  } catch (error) {
    console.error('Get installed plugins error:', error);
    res.status(500).json({ error: 'Failed to get installed plugins' });
  }
});

// Install a plugin
router.post('/plugins/:pluginId/install', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { pluginId } = req.params;
    const { chatId } = req.body;

    const plugin = await prisma.plugin.findUnique({ where: { id: pluginId } });
    if (!plugin) return res.status(404).json({ error: 'Plugin not found' });

    const existing = await prisma.pluginInstallation.findUnique({
      where: { pluginId_userId: { pluginId, userId } },
    });
    if (existing) return res.status(400).json({ error: 'Already installed' });

    await prisma.$transaction([
      prisma.plugin.update({ where: { id: pluginId }, data: { installCount: { increment: 1 } } }),
      prisma.pluginInstallation.create({ data: { pluginId, userId, chatId } }),
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error('Install plugin error:', error);
    res.status(500).json({ error: 'Failed to install plugin' });
  }
});

// Uninstall a plugin
router.delete('/plugins/:pluginId/uninstall', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { pluginId } = req.params;

    await prisma.pluginInstallation.deleteMany({ where: { pluginId, userId } });
    await prisma.plugin.update({ where: { id: pluginId }, data: { installCount: { decrement: 1 } } }).catch(() => {});

    res.json({ success: true });
  } catch (error) {
    console.error('Uninstall plugin error:', error);
    res.status(500).json({ error: 'Failed to uninstall plugin' });
  }
});

// Create plugin
router.post('/plugins', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const creatorId = req.userId!;
    const { name, description, version, type, webhookUrl, config, iconUrl, isPublic } = req.body;

    if (!name) return res.status(400).json({ error: 'name required' });

    const plugin = await prisma.plugin.create({
      data: { creatorId, name, description, version, type: type || 'bot', webhookUrl, config: config || '{}', iconUrl, isPublic: isPublic !== false },
    });
    res.json(plugin);
  } catch (error) {
    console.error('Create plugin error:', error);
    res.status(500).json({ error: 'Failed to create plugin' });
  }
});

// Get plugin bot commands
router.get('/plugins/:pluginId/commands', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { pluginId } = req.params;
    const commands = await prisma.pluginBotCommand.findMany({
      where: { pluginId, isActive: true },
    });
    res.json(commands);
  } catch (error) {
    console.error('Get plugin commands error:', error);
    res.status(500).json({ error: 'Failed to get commands' });
  }
});

// Add bot command to plugin
router.post('/plugins/:pluginId/commands', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { pluginId } = req.params;
    const { command, response } = req.body;

    if (!command || !response) return res.status(400).json({ error: 'command and response required' });

    // Verify ownership
    const plugin = await prisma.plugin.findUnique({ where: { id: pluginId }, select: { creatorId: true } });
    if (!plugin || plugin.creatorId !== req.userId) return res.status(403).json({ error: 'Not your plugin' });

    const cmd = await prisma.pluginBotCommand.create({
      data: { pluginId, command: command.startsWith('/') ? command : `/${command}`, response },
    });
    res.json(cmd);
  } catch (error) {
    console.error('Add command error:', error);
    res.status(500).json({ error: 'Failed to add command' });
  }
});

export default router;
