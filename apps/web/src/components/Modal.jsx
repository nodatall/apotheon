import React from 'react';
import {
  Button,
  Modal as HeroModal,
  ModalBody,
  ModalContent,
  ModalHeader
} from '@heroui/react';

export default function Modal({ title, onClose, children }) {
  return (
    <HeroModal
      isOpen
      size="2xl"
      backdrop="blur"
      scrollBehavior="inside"
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex items-center justify-between gap-3">
              <span>{title}</span>
              <Button isIconOnly size="sm" variant="light" onPress={onClose} aria-label="Close modal">
                ×
              </Button>
            </ModalHeader>
            <ModalBody className="pb-6">{children}</ModalBody>
          </>
        )}
      </ModalContent>
    </HeroModal>
  );
}
