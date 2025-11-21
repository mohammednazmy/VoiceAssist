<?php

declare(strict_types=1);

namespace OCA\VoiceassistClient\AppInfo;

use OCP\AppFramework\App;

class Application extends App {
    public function __construct(array $urlParams = []) {
        parent::__construct('voiceassist-client', $urlParams);
        // Placeholder for future service registration, event handlers, etc.
    }
}
