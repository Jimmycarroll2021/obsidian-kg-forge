import { beforeEach } from 'vitest';
import { installDomHelpers, Modal, Notice } from './mocks/obsidian';

installDomHelpers();
beforeEach(() => {
	document.body.replaceChildren();
	Modal.instances.length = 0;
	Notice.messages.length = 0;
});
