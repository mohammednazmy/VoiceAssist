<?php

declare(strict_types=1);

namespace OCA\VoiceassistDocs\AppInfo;

use OCP\AppFramework\App;

class Application extends App {
    public function __construct(array $urlParams = []) {
        parent::__construct('voiceassist-docs', $urlParams);
        // Placeholder for future service registration, event handlers, etc.
    }
}
