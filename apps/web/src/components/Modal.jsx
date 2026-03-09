import React from 'react';
import {
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
            <ModalHeader>{title}</ModalHeader>
            <ModalBody className="pb-6">{children}</ModalBody>
          </>
        )}
      </ModalContent>
    </HeroModal>
  );
}
